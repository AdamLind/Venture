// components/moderation/ReviewPanel.tsx
// Staff review on an idea's page (#26): its open reports, its review
// history, and the decisions. Shown from the queue, or with Staff tools on.
// The database checks every decision (review_idea / resolve_reports).

import React, {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, Alert, Pressable, Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {useRouter} from "expo-router";
import * as Haptics from "expo-haptics";
import Toast from "react-native-toast-message";

import {StatusChip} from "@/components/ideas/IdeaRows";
import ReviewNoteSheet, {type NoteKind} from "@/components/moderation/ReviewNoteSheet";
import type {NoteDecision, RuleId} from "@/src/lib/ideaGuidelines";
import {
  REPORT_REASON_LABEL,
  type Decision,
  type LogEntry,
  type Report,
  ago,
  fetchIdeaReview,
  historyLine,
  isNewPlace,
  nearPosterHome,
  resolveReports,
  reviewIdea,
  setSuspension,
} from "@/src/lib/moderation";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useStaffStore} from "@/src/store/useStaffStore";
import type {IdeaVisibility} from "@/types/ideas";
import PlaceReviewSheet from "@/components/moderation/PlaceReviewSheet";

const STAFF_COLOR = "#a78bfa";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const DECISIONS: Record<Decision, {label: string; icon: IconName; color: string; to: IdeaVisibility}> = {
  APPROVE: {label: "Approve", icon: "checkmark", color: "#34d399", to: "PUBLISHED"},
  REQUEST_CHANGES: {label: "Changes", icon: "create-outline", color: "#fb923c", to: "NEEDS_REVISION"},
  REJECT: {label: "Reject", icon: "close", color: "#f87171", to: "REJECTED"},
};

const DONE_TOAST: Record<Decision, string> = {
  APPROVE: "Published",
  REQUEST_CHANGES: "Sent back for changes",
  REJECT: "Rejected",
};

export default function ReviewPanel({
  idea,
  onDecided,
}: {
  idea: {
    idea_id: number;
    user_id: string | null;
    visibility: IdeaVisibility;
    held_at?: string | null;
    users?: {username: string | null} | null;
    /** Its place: a new one goes public with this idea (#88) */
    venue_id?: string | null;
    venues?: {
      name?: string | null;
      address?: string | null;
      coordinates?: string | null;
      opening_hours?: string | null;
      access_note?: string | null;
      pinned_by?: {username: string | null} | null;
    } | null;
  };
  /** After a decision: the idea's new state */
  onDecided: (visibility: IdeaVisibility, note: string | null, rules: RuleId[] | null) => void;
}) {
  const router = useRouter();
  const role = useStaffStore((s) => s.role);
  const myUserId = useProfileStore((s) => s.userId);
  const myUsername = useProfileStore((s) => s.profile?.username ?? null);

  const [reports, setReports] = useState<Report[] | null>(null);
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Decision | "DISMISS" | "SUSPEND" | null>(null);
  const [creatorSuspended, setCreatorSuspended] = useState(false);
  // The note sheet: sending back, rejecting, or suspending the creator
  const [noteFor, setNoteFor] = useState<NoteKind | null>(null);

  // A new place (no published idea yet) goes public when this idea is
  // approved, so it's checked too: Approve waits for "I checked the place"
  const [newPlace, setNewPlace] = useState(false);
  const [placeChecked, setPlaceChecked] = useState(false);
  // Pinned near the poster's home (yes or no only)
  const [nearHome, setNearHome] = useState(false);
  const [placeSheetOpen, setPlaceSheetOpen] = useState(false);
  useEffect(() => {
    if (idea.visibility === "PUBLISHED" || !idea.venue_id) return;
    let active = true;
    isNewPlace(idea.venue_id, idea.idea_id)
      .then(async (isNew) => {
        if (!active) return;
        setNewPlace(isNew);
        if (isNew) {
          const near = await nearPosterHome(idea.idea_id).catch(() => false);
          if (active) setNearHome(near);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [idea.venue_id, idea.idea_id, idea.visibility]);
  const checkingPlace = newPlace && idea.visibility !== "PUBLISHED";
  const placeName = idea.venues?.name ?? "this place";

  // Bumped to reload after a decision
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    fetchIdeaReview(idea.idea_id, idea.user_id)
      .then((result) => {
        if (!active) return;
        setReports(result.reports);
        setHistory(result.history);
        setCreatorSuspended(result.creatorSuspended);
        setLoadError(null);
      })
      .catch((e) => {
        if (active) setLoadError(e instanceof Error ? e.message : "Couldn't load reports");
      });
    return () => {
      active = false;
    };
  }, [idea.idea_id, idea.user_id, version]);

  // Moderators can't decide on their own ideas; admins can (it's logged)
  const ownIdea = !!myUserId && idea.user_id === myUserId;
  const canDecide = !!role && (!ownIdea || role === "ADMIN");
  const decisions = (Object.keys(DECISIONS) as Decision[]).filter(
    (d) => DECISIONS[d].to !== idea.visibility,
  );
  const openReports = reports?.length ?? 0;

  const decide = async (decision: Decision, note?: string, rules?: RuleId[]) => {
    setBusy(decision);
    try {
      await reviewIdea(idea.idea_id, decision, note, rules);
      if (process.env.EXPO_OS === "ios") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({type: "success", text1: DONE_TOAST[decision], position: "bottom"});
      setNoteFor(null);
      onDecided(
        DECISIONS[decision].to,
        decision === "APPROVE" ? null : (note ?? null),
        decision === "APPROVE" || !rules?.length ? null : rules,
      );
      load();
    } catch (e) {
      Alert.alert("Couldn't save that", e instanceof Error ? e.message : "Please try again.");
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const onDecision = (decision: Decision) => {
    if (decision === "APPROVE") {
      const publishes = idea.visibility !== "PUBLISHED";
      Alert.alert(
        publishes ? "Publish this idea?" : "Approve it?",
        openReports
          ? "Its open reports stay open. Dismiss them if nothing's wrong."
          : checkingPlace
            ? `It shows in Discover for everyone, and so does ${placeName}.`
            : "It shows in Discover for everyone.",
        [
          {text: "Cancel", style: "cancel"},
          {text: "Approve", onPress: () => decide("APPROVE").catch(() => {})},
        ],
      );
      return;
    }
    setNoteFor(decision);
  };

  const dismiss = () =>
    Alert.alert("Dismiss the reports?", "Nothing's wrong with it. It stays as it is.", [
      {text: "Cancel", style: "cancel"},
      {
        text: "Dismiss",
        onPress: async () => {
          setBusy("DISMISS");
          try {
            await resolveReports(idea.idea_id, "DISMISSED");
            Toast.show({type: "success", text1: "Reports dismissed", position: "bottom"});
            load();
          } catch (e) {
            Alert.alert("Couldn't dismiss them", e instanceof Error ? e.message : "Please try again.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  // Suspend the creator (repeat offenders), or lift it. Staff can't be
  // suspended; the database says so
  const creatorName = idea.users?.username ? `@${idea.users.username}` : "the creator";
  // Suspending from here rejects this idea too (unless it already is)
  const rejectsIdea = idea.visibility !== "REJECTED" && idea.visibility !== "PRIVATE";
  /** Throws (after saying so) when it fails, so the note sheet stays open */
  const runSuspension = async (suspend: boolean, note: string | null) => {
    if (!idea.user_id) return;
    setBusy("SUSPEND");
    try {
      await setSuspension(idea.user_id, suspend, note, idea.idea_id);
      Toast.show({
        type: "success",
        text1: suspend ? `Suspended ${creatorName}` : "Suspension lifted",
        text2: suspend && rejectsIdea ? "This idea was rejected too." : undefined,
        position: "bottom",
      });
      setNoteFor(null);
      if (suspend && rejectsIdea) onDecided("REJECTED", note?.trim() || null, null);
      load();
    } catch (e) {
      Alert.alert("Couldn't save that", e instanceof Error ? e.message : "Please try again.");
      throw e;
    } finally {
      setBusy(null);
    }
  };
  const onSuspend = () => {
    if (creatorSuspended) {
      Alert.alert(`Lift the suspension on ${creatorName}?`, "They can publish and report again.", [
        {text: "Cancel", style: "cancel"},
        {text: "Lift it", onPress: () => runSuspension(false, null).catch(() => {})},
      ]);
      return;
    }
    // The reason goes in the note sheet (room to write it, quick picks)
    setNoteFor("SUSPEND");
  };
  const suspendHint = `For repeat offenders. ${
    rejectsIdea ? "This idea is rejected too, and they" : "They"
  } can't publish or report; their other ideas leave Discover. They can still plan privately. They'll see this reason, and it's logged.`;

  // Reasons with counts: "Spam or misleading ×2"
  const reasonCounts = new Map<string, number>();
  for (const r of reports ?? []) {
    reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
  }
  const details = (reports ?? []).filter((r) => r.details);

  return (
    <View
      className="rounded-3xl p-4 mb-6 border gap-4"
      style={{backgroundColor: `${STAFF_COLOR}10`, borderColor: `${STAFF_COLOR}55`}}
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name="shield-checkmark" size={16} color={STAFF_COLOR} />
        <Text className="font-bold text-base flex-1" style={{color: STAFF_COLOR}}>
          Staff review
        </Text>
        <Pressable
          onPress={() => router.push("/guidelines")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Idea guidelines"
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Ionicons name="book-outline" size={14} color={STAFF_COLOR} />
          <Text className="text-xs font-bold" style={{color: STAFF_COLOR}}>
            Guidelines
          </Text>
        </Pressable>
        <StatusChip visibility={idea.visibility} />
      </View>

      {/* REPORTS */}
      {reports === null && !loadError ? (
        <ActivityIndicator color={STAFF_COLOR} />
      ) : loadError ? (
        <Text className="text-red-400 text-sm">{loadError}</Text>
      ) : openReports > 0 ? (
        <View className="gap-2">
          <Text className="text-white font-bold">
            {openReports} open report{openReports === 1 ? "" : "s"}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {[...reasonCounts].map(([reason, count]) => (
              <View key={reason} className="bg-red-500/15 rounded-full px-2.5 py-1">
                <Text className="text-red-300 text-xs font-bold">
                  {REPORT_REASON_LABEL[reason as keyof typeof REPORT_REASON_LABEL] ?? reason}
                  {count > 1 ? ` ×${count}` : ""}
                </Text>
              </View>
            ))}
          </View>
          {details.slice(0, 5).map((r, i) => (
            <Text key={i} className="text-zinc-300 text-sm">
              “{r.details}” <Text className="text-zinc-500">· {ago(r.created_at)} ago</Text>
            </Text>
          ))}
        </View>
      ) : (
        <Text className="text-zinc-400 text-sm">No open reports.</Text>
      )}

      {/* A NEW PLACE: a small card; tap to check it (#88: components/moderation/PlaceReviewSheet.tsx) */}
      {checkingPlace && (
        <Pressable
          onPress={() => setPlaceSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`New place: ${placeName}. ${placeChecked ? "Checked" : "Not checked yet"}. Open`}
          className={`flex-row items-center gap-2.5 rounded-2xl px-3.5 py-3 border active:opacity-80 ${
            placeChecked ? "bg-emerald-500/10 border-emerald-400/40" : "bg-orange-500/10 border-orange-400/40"
          }`}
        >
          <Ionicons name={placeChecked ? "checkmark-circle" : "pin"} size={16} color={placeChecked ? "#6ee7b7" : "#fdba74"} />
          <View className="flex-1">
            <Text className="text-white font-bold text-sm" numberOfLines={1}>
              New place: {placeName}
            </Text>
            <Text className={`text-xs ${placeChecked ? "text-emerald-200/80" : "text-orange-100/80"}`}>
              {placeChecked ? "Checked" : "Not checked yet"}
            </Text>
          </View>
          {nearHome && <Ionicons name="home" size={15} color="#fca5a5" accessibilityLabel="Near the poster's home" />}
          <Ionicons name="chevron-forward" size={16} color="#a1a1aa" />
        </Pressable>
      )}

      {/* DECISIONS */}
      {canDecide ? (
        <View className="gap-2">
          <View className="flex-row gap-2">
            {decisions.map((d) => {
              const c = DECISIONS[d];
              // A new place has to be checked before it's approved along with the idea
              const waiting = d === "APPROVE" && checkingPlace && !placeChecked;
              return (
                <Pressable
                  key={d}
                  onPress={() => onDecision(d)}
                  disabled={!!busy || waiting}
                  accessibilityRole="button"
                  accessibilityLabel={c.label}
                  accessibilityHint={waiting ? "Check the place first" : undefined}
                  className="flex-1 h-11 rounded-2xl flex-row items-center justify-center gap-1.5 active:opacity-80"
                  style={{backgroundColor: `${c.color}22`, opacity: (busy && busy !== d) || waiting ? 0.4 : 1}}
                >
                  {busy === d ? (
                    <ActivityIndicator color={c.color} size="small" />
                  ) : (
                    <Ionicons name={c.icon} size={16} color={c.color} />
                  )}
                  <Text className="font-bold text-sm" style={{color: c.color}}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {openReports > 0 && (
            <Pressable
              onPress={dismiss}
              disabled={!!busy}
              accessibilityRole="button"
              className="h-11 rounded-2xl items-center justify-center bg-zinc-800/80 active:opacity-80"
            >
              {busy === "DISMISS" ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-bold text-sm">Dismiss reports: nothing&apos;s wrong</Text>
              )}
            </Pressable>
          )}
          {idea.visibility === "PUBLISHED" && idea.held_at ? (
            <View className="flex-row gap-2 bg-amber-500/10 rounded-2xl px-3 py-2.5">
              <Ionicons name="eye-off" size={14} color="#fcd34d" style={{marginTop: 2}} />
              <Text className="text-amber-100/80 text-xs flex-1">
                Hidden from Discover automatically after its reports. Dismiss them to bring it back, or
                send it back or reject it.
              </Text>
            </View>
          ) : idea.visibility === "PUBLISHED" ? (
            <Text className="text-zinc-500 text-xs">
              Changes or Reject takes it out of Discover and closes its reports.
            </Text>
          ) : null}
        </View>
      ) : (
        <Text className="text-zinc-400 text-sm">
          This is your idea, so someone else needs to review it.
        </Text>
      )}

      {/* THE CREATOR: suspend repeat offenders (not your own ideas). Rare,
          so a small link rather than another big button */}
      {canDecide && !ownIdea && idea.user_id && (
        <Pressable
          onPress={onSuspend}
          disabled={!!busy}
          hitSlop={8}
          accessibilityRole="button"
          className="self-end flex-row items-center gap-1 -mt-1 active:opacity-60"
        >
          {busy === "SUSPEND" ? (
            <ActivityIndicator color="#a1a1aa" size="small" />
          ) : (
            <>
              <Ionicons
                name={creatorSuspended ? "lock-open-outline" : "ban-outline"}
                size={12}
                color={creatorSuspended ? "#a1a1aa" : "#71717a"}
              />
              <Text className="text-xs font-semibold text-zinc-500">
                {creatorSuspended ? `${creatorName} is suspended · Lift it` : `Suspend ${creatorName}`}
              </Text>
            </>
          )}
        </Pressable>
      )}

      {/* HISTORY */}
      {history.length > 0 && (
        <View className="gap-1.5 pt-3 border-t border-zinc-800">
          <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider">History</Text>
          {history.slice(0, 5).map((entry) => (
            <Text key={entry.action_id} className="text-zinc-400 text-sm">
              {historyLine(entry, myUsername)}
              {entry.note ? `: “${entry.note}”` : ""}
              <Text className="text-zinc-600"> · {ago(entry.created_at)} ago</Text>
            </Text>
          ))}
        </View>
      )}

      <PlaceReviewSheet
        visible={placeSheetOpen}
        place={idea.venues}
        nearHome={nearHome}
        checked={placeChecked}
        onClose={() => setPlaceSheetOpen(false)}
        onChecked={setPlaceChecked}
      />

      <ReviewNoteSheet
        decision={noteFor}
        title={noteFor === "SUSPEND" ? `Suspend ${creatorName}` : undefined}
        hint={noteFor === "SUSPEND" ? suspendHint : undefined}
        onClose={() => setNoteFor(null)}
        onSend={(note, rules) =>
          noteFor === "SUSPEND" ? runSuspension(true, note) : decide(noteFor as NoteDecision, note, rules)
        }
      />
    </View>
  );
}
