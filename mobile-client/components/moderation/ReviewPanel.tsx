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
import ReviewNoteSheet from "@/components/moderation/ReviewNoteSheet";
import type {NoteDecision, RuleId} from "@/src/lib/ideaGuidelines";
import {
  REPORT_REASON_LABEL,
  type Decision,
  type LogEntry,
  type Report,
  ago,
  fetchIdeaReview,
  historyLine,
  resolveReports,
  reviewIdea,
} from "@/src/lib/moderation";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useStaffStore} from "@/src/store/useStaffStore";
import type {IdeaVisibility} from "@/types/ideas";

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
  idea: {idea_id: number; user_id: string | null; visibility: IdeaVisibility};
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
  const [busy, setBusy] = useState<Decision | "DISMISS" | null>(null);
  const [noteFor, setNoteFor] = useState<NoteDecision | null>(null);

  // Bumped to reload after a decision
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    fetchIdeaReview(idea.idea_id)
      .then((result) => {
        if (!active) return;
        setReports(result.reports);
        setHistory(result.history);
        setLoadError(null);
      })
      .catch((e) => {
        if (active) setLoadError(e instanceof Error ? e.message : "Couldn't load reports");
      });
    return () => {
      active = false;
    };
  }, [idea.idea_id, version]);

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
        openReports ? "Its open reports stay open. Dismiss them if nothing's wrong." : "It shows in Discover for everyone.",
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

      {/* DECISIONS */}
      {canDecide ? (
        <View className="gap-2">
          <View className="flex-row gap-2">
            {decisions.map((d) => {
              const c = DECISIONS[d];
              return (
                <Pressable
                  key={d}
                  onPress={() => onDecision(d)}
                  disabled={!!busy}
                  accessibilityRole="button"
                  accessibilityLabel={c.label}
                  className="flex-1 h-11 rounded-2xl flex-row items-center justify-center gap-1.5 active:opacity-80"
                  style={{backgroundColor: `${c.color}22`, opacity: busy && busy !== d ? 0.5 : 1}}
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
          {idea.visibility === "PUBLISHED" && (
            <Text className="text-zinc-500 text-xs">
              Changes or Reject takes it out of Discover and closes its reports.
            </Text>
          )}
        </View>
      ) : (
        <Text className="text-zinc-400 text-sm">
          This is your idea, so someone else needs to review it.
        </Text>
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

      <ReviewNoteSheet
        decision={noteFor}
        onClose={() => setNoteFor(null)}
        onSend={(note, rules) => decide(noteFor!, note, rules)}
      />
    </View>
  );
}
