// app/itinerary/[id].tsx
// A saved date: its stops, who's on it and comments (#36), plus start / end /
// rename / delete. What you can do depends on your role: the owner and
// editors change it; commenters comment; an invite waits for your answer.

import React, {useCallback, useMemo, useRef, useState} from "react";
import {sizedImage} from "@/src/lib/images";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Switch,
} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect, useLocalSearchParams, router} from "expo-router";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {canEditDate, useItineraryStore} from "@/src/store/useItineraryStore";
import {useProfileStore} from "@/src/store/useProfileStore";
import {usePartner} from "@/src/store/useConnectionsStore";
import DatePeople from "@/components/dates/DatePeople";
import {useRevealAboveKeyboard} from "@/hooks/useRevealAboveKeyboard";
import DateComments, {CommentThread} from "@/components/dates/DateComments";
import {
  type DateComment,
  type DateMember,
  fetchComments,
  fetchMembers,
  fetchReads,
  markRead,
  memberName,
  removeFromDate,
  threadKey,
} from "@/src/lib/sharedDates";
import {
  coverImage,
  formatTimeOfDay,
  formatWhen,
  buildTimeline,
  placedStops,
  stopCountLabel,
} from "@/src/lib/dates";
import type {ItineraryStatus} from "@/types/dates";
import Toast from "@/src/lib/toast";
import ReplaceSheet from "@/components/dates/ReplaceSheet";
import {
  checkEdit,
  clashMessage,
  clashWith,
  endOfTimeline,
  startOfTimeline,
  type Replacement,
} from "@/utils/editDate";
import {evaluatePlan, warningsByStop, type PlanIssue} from "@/utils/planEvaluator";
import {smartOrderSummary} from "@/utils/smartOrder";
import type {PlacedActivity} from "@/utils/timeline";
import type {UserPrefs} from "@/src/store/usePrefsStore";
import {showError, showInfo} from "@/src/lib/notify";
import PhotoViewer from "@/components/dates/PhotoViewer";
import {type Capture, coverPhoto} from "@/src/lib/captures";
import {useCaptureStore, useDatePhotos} from "@/src/store/useCaptureStore";
import {afterSheetCloses, choose, confirm} from "@/src/lib/sheets";

type Busy = null | "start" | "end" | "delete" | "rename" | "accept" | "decline" | "leave" | "edit";

const STATUS_BADGE: Record<
  ItineraryStatus,
  {label: string; className: string; text: string}
> = {
  PLANNED: {
    label: "Planned",
    className: "bg-blue-500/15 border-blue-500/40",
    text: "text-blue-300",
  },
  ACTIVE: {
    label: "Happening now",
    className: "bg-[#FF9D0A]/15 border-[#FF9D0A]/40",
    text: "text-[#FF9D0A]",
  },
  COMPLETED: {
    label: "Finished",
    className: "bg-zinc-800 border-zinc-700",
    text: "text-zinc-300",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-zinc-800 border-zinc-700",
    text: "text-zinc-400",
  },
};

const screenStyle = {flex: 1, backgroundColor: "#000"} as const;

export default function ItineraryDetailScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const itineraryId = Number(id);

  // Yours or accepted, an invite you haven't answered, or your partner's
  const itinerary = useItineraryStore(
    (s) =>
      s.itineraries.find((i) => i.itinerary_id === itineraryId) ??
      s.invites.find((i) => i.itinerary_id === itineraryId) ??
      s.partnerDates.find((i) => i.itinerary_id === itineraryId),
  );
  const setSurprise = useItineraryStore((s) => s.setSurprise);
  const editStops = useItineraryStore((s) => s.editStops);
  // Your other dates, to catch one running into another
  const myDates = useItineraryStore((s) => s.itineraries);

  // ─── What's off with the plan (the builder's checks), before it starts ───
  // A stop that's closed when you'd get there, the date running late, …
  // shown on the stops; and the date running into another of yours
  const planCheck = useMemo(() => {
    if (!itinerary?.prefs_snapshot || itinerary.status !== "PLANNED") return null;
    const timeline = buildTimeline(itinerary);
    if (!timeline) return null;
    const evaluation = evaluatePlan(
      placedStops(itinerary).map((s) => s.placed),
      itinerary.prefs_snapshot as UserPrefs,
      timeline,
    );
    const clash = clashWith(
      itinerary.itinerary_id,
      new Date(itinerary.starts_at).getTime(),
      new Date(itinerary.ends_at).getTime(),
      myDates,
    );
    return {
      byStop: warningsByStop(evaluation),
      notes: [
        ...(clash ? [clashMessage(clash)] : []),
        ...evaluation.issues.filter((i) => i.stopId == null).map((i) => i.message),
      ],
    };
  }, [itinerary, myDates]);
  const partner = usePartner();
  const respondToInvite = useItineraryStore((s) => s.respondToInvite);
  const reloadDates = useItineraryStore((s) => s.reload);
  const myUserId = useProfileStore((s) => s.userId);
  const loadStatus = useItineraryStore((s) => s.status);
  const startDate = useItineraryStore((s) => s.startDate);
  const completeDate = useItineraryStore((s) => s.completeDate);
  const rename = useItineraryStore((s) => s.rename);
  const remove = useItineraryStore((s) => s.remove);

  const [busy, setBusy] = useState<Busy>(null);
  // Editing the stops (#36): Replace / Remove under each, and the sheet
  const [editing, setEditing] = useState(false);
  const [replacing, setReplacing] = useState<number | null>(null);
  // Comment boxes are low on the page: scroll them above the keyboard
  const {scrollRef, onScroll: trackScroll, reveal: revealInput} = useRevealAboveKeyboard();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Who's on it, and its comments (#36)
  const [members, setMembers] = useState<DateMember[] | null>(null);
  const [comments, setComments] = useState<DateComment[] | null>(null);
  // The newest comment you've seen in each thread (0: the whole date)
  const [reads, setReads] = useState<Map<number, number>>(new Map());
  // Stops whose comment thread is open (the ref: for marking them seen on load)
  const [openThreads, setOpenThreads] = useState<Set<number>>(new Set());
  const openThreadsRef = useRef<Set<number>>(new Set());
  const accepted = itinerary?.my_status === "ACCEPTED";
  const loadSharing = useCallback(async () => {
    try {
      setMembers(await fetchMembers(itineraryId));
      // Comments open once you've said yes
      if (accepted) {
        const [all, seen] = await Promise.all([fetchComments(itineraryId), fetchReads(itineraryId)]);
        // Threads in view (the whole date, and any you've opened) are seen
        // as they load, including new comments that arrived meanwhile
        const updated = new Map(seen);
        for (const key of [0, ...openThreadsRef.current]) {
          const thread = all.filter((c) => threadKey(c.stop_id) === key);
          const newest = thread.length ? Math.max(...thread.map((c) => c.comment_id)) : 0;
          const unseen = thread.some((c) => c.user_id !== myUserId && c.comment_id > (seen.get(key) ?? 0));
          if (unseen) {
            updated.set(key, newest);
            markRead(itineraryId, key || null, newest).catch((e) => console.warn("Couldn't mark comments read:", e));
          }
        }
        setComments(all);
        setReads(updated);
      } else {
        setComments([]);
      }
    } catch (e) {
      console.warn("Couldn't load who's on this date:", e);
      setMembers((m) => m ?? []);
      setComments((c) => c ?? []);
    }
  }, [itineraryId, accepted, myUserId]);
  useFocusEffect(
    useCallback(() => {
      loadSharing();
    }, [loadSharing]),
  );
  const onSharingChanged = () => {
    loadSharing();
    reloadDates();
  };

  // ─── Photos from the date (#43) ──────────────────────────────────────────
  // The end-of-date photo (or the last one) heads the page; each stop shows
  // the ones taken there; tap one to see them full screen
  const photos = useDatePhotos(itineraryId);
  const loadPhotos = useCaptureStore((s) => s.load);
  useFocusEffect(
    useCallback(() => {
      loadPhotos([itineraryId]);
    }, [itineraryId, loadPhotos]),
  );
  const [viewing, setViewing] = useState<{list: Capture[]; at: number} | null>(null);
  const heroPhoto = coverPhoto(photos);
  const photoName = (userId: string) => {
    if (userId === myUserId) return "You";
    const m = (members ?? []).find((x) => x.user_id === userId);
    return m ? memberName(m) : "Someone";
  };
  const stopIdeaIds = new Set(itinerary?.stops.map((s) => s.activity?.idea_id).filter((id) => id != null));
  // Not from a stop that's still on it: the end-of-date photos (except the
  // cover), and ones from a stop taken off since
  const otherPhotos = photos.filter(
    (p) => p !== heroPhoto && (p.kind === "END" || p.activity_id == null || !stopIdeaIds.has(p.activity_id)),
  );

  // ─── Comment threads (the whole date, and each stop) ───────────────────────
  const threadOf = (stopId: number | null) =>
    (comments ?? []).filter((c) => threadKey(c.stop_id) === threadKey(stopId));
  /** Someone else commented since you last looked */
  const hasUnseen = (stopId: number | null) => {
    const seen = reads.get(threadKey(stopId)) ?? 0;
    return threadOf(stopId).some((c) => c.user_id !== myUserId && c.comment_id > seen);
  };
  // Looking at a thread: you've seen it, up to its newest comment
  const seeThread = (stopId: number | null) => {
    const thread = threadOf(stopId);
    if (!thread.length || !hasUnseen(stopId)) return;
    const newest = Math.max(...thread.map((c) => c.comment_id));
    setReads((prev) => new Map(prev).set(threadKey(stopId), newest));
    markRead(itineraryId, stopId, newest).catch((e) => console.warn("Couldn't mark comments read:", e));
  };
  const toggleThread = (stopId: number) => {
    const next = new Set(openThreads);
    const opening = !next.has(stopId);
    if (opening) next.add(stopId);
    else next.delete(stopId);
    openThreadsRef.current = next;
    setOpenThreads(next);
    if (opening) seeThread(stopId);
  };

  if (!itinerary) {
    return (
      <SafeAreaView edges={["top"]} style={screenStyle}>
        <ScreenHeader title="Date" />
        <View className="flex-1 items-center justify-center px-8">
          {loadStatus === "loading" ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-zinc-400 text-center">
              {"This date isn't available anymore."}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const run = async (kind: Busy, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (e) {
      showError("Something went wrong", e);
    } finally {
      setBusy(null);
    }
  };

  const onStart = () =>
    run("start", async () => {
      await startDate(itineraryId);
      router.push("/active-date");
    });

  const onEnd = async () => {
    const ok = await confirm({
      title: "End this date?",
      message: "It moves to your Memories.",
      confirmLabel: "End date",
      destructive: true,
      icon: "flag-outline",
    });
    if (ok) run("end", () => completeDate(itineraryId));
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this date?",
      message: "It's removed for everyone on it. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
      icon: "trash-outline",
    });
    if (!ok) return;
    run("delete", async () => {
      await remove(itineraryId);
      router.back();
    });
  };

  const isOwner = itinerary.my_role === "OWNER";
  // Comment threads show on dates shared with someone, once you've said yes
  const showComments = accepted && (members?.length ?? 0) > 1;
  const canEdit = canEditDate(itinerary);
  const canComment = canEdit || itinerary.my_role === "COMMENTER";
  const pending = itinerary.my_status === "PENDING";
  // Your partner's date: you see it because you're partners (#35)
  const partnersDate = itinerary.my_status === null;
  // The owner can hide it from their partner, unless they're on it already
  const partnerOnIt = !!partner && (members ?? []).some((m) => m.user_id === partner.user_id);
  const canSurprise = isOwner && !!partner && !partnerOnIt && itinerary.status !== "COMPLETED";
  // ─── Editing the stops (#36) ──────────────────────────────────────────────
  // Before it starts, the owner and editors can replace or remove a stop;
  // the rest is laid out again with the date's own prefs
  const canEditStops = canEdit && itinerary.status === "PLANNED" && !!itinerary.prefs_snapshot;
  type Entry = {stopId?: number; placed: PlacedActivity};
  const entriesNow = (): Entry[] => placedStops(itinerary);

  /**
   * Save a change, first saying what it'd break (and offering a reorder that
   * fixes it). `beforeAsking` waits for a sheet that's closing (iOS can't
   * show the question while it does).
   */
  const applyEdit = async (entries: Entry[], done: string, beforeAsking?: () => Promise<void>) => {
    const prefs = itinerary.prefs_snapshot as UserPrefs;
    const check = checkEdit(entries.map((e) => e.placed), prefs);
    // Running longer could run into another of your dates
    const clash = clashWith(itineraryId, startOfTimeline(check.timeline), endOfTimeline(check.timeline), myDates);
    if (clash) {
      check.problems.unshift({
        kind: "PAST_END",
        severity: "hard",
        stopId: null,
        relatedIds: [],
        message: clashMessage(clash),
        penalty: 0,
      } as PlanIssue);
    }
    const save = (list: Entry[]) =>
      run("edit", async () => {
        await editStops(itineraryId, list);
        Toast.show({type: "success", text1: done});
      });
    if (check.problems.length === 0) {
      save(entries);
      return;
    }
    const what = check.problems
      .slice(0, 2)
      .map((p) => `• ${p.message}`)
      .join("\n");
    await beforeAsking?.();
    if (check.reorder) {
      const byIdea = new Map(entries.map((e) => [e.placed.activity.idea_id, e]));
      const reordered = check.reorder.order.map((p) => byIdea.get(p.activity.idea_id)!);
      const pick = await choose({
        title: "This causes a problem",
        message: what,
        options: [
          {
            label: "Reorder",
            hint: `${smartOrderSummary(check.reorder) ?? "A new order fixes it"}.`,
            icon: "swap-vertical-outline",
            value: "REORDER" as const,
          },
          {label: "Keep this order", icon: "checkmark-outline", value: "KEEP" as const},
        ],
      });
      if (pick === "REORDER") save(reordered);
      else if (pick === "KEEP") save(entries);
    } else {
      const ok = await confirm({title: "Heads up", message: what, confirmLabel: "Save anyway", icon: "alert-circle-outline"});
      if (ok) save(entries);
    }
  };

  const removeStop = async (i: number) => {
    const entries = entriesNow();
    const title = entries[i]?.placed.activity.title ?? "this stop";
    if (entries.length <= 1) {
      showInfo("It's the only stop", "Replace it, or delete the date");
      return;
    }
    const ok = await confirm({
      title: `Remove ${title}?`,
      message: "The rest of the date moves up to fill the time.",
      confirmLabel: "Remove",
      destructive: true,
      icon: "remove-circle-outline",
    });
    if (ok) applyEdit(entries.filter((_, j) => j !== i), `Removed ${title}`);
  };

  const replaceStop = (i: number, replacement: Replacement) => {
    setReplacing(null);
    const entries = entriesNow();
    const before = entries[i]?.placed.activity.title ?? "it";
    const next = entries.map((e, j) => (j === i ? {placed: {activity: replacement}} : e));
    // (the replace sheet is still sliding away)
    applyEdit(next, `Swapped ${before} for ${replacement.title}`, afterSheetCloses);
  };

  const toggleSurprise = (on: boolean) =>
    run(null, async () => {
      await setSurprise(itineraryId, on);
    });
  const owner = members?.find((m) => m.role === "OWNER") ?? null;
  const ownerName = owner ? memberName(owner) : "Someone";

  const onAnswer = (accept: boolean) =>
    run(accept ? "accept" : "decline", async () => {
      await respondToInvite(itineraryId, accept);
      if (!accept) router.back();
    });

  const onLeave = async () => {
    const ok = await confirm({
      title: "Leave this date?",
      message: "You won't see it anymore. The owner can invite you again.",
      confirmLabel: "Leave",
      destructive: true,
      icon: "exit-outline",
    });
    if (!ok) return;
    run("leave", async () => {
      if (!myUserId) return;
      await removeFromDate(itineraryId, myUserId);
      await reloadDates();
      router.back();
    });
  };

  const saveTitle = () =>
    run("rename", async () => {
      await rename(itineraryId, titleDraft);
      setEditingTitle(false);
    });

  const badge = STATUS_BADGE[itinerary.status];

  return (
    <SafeAreaView edges={["top"]} style={screenStyle}>
      <ScreenHeader title="Date" />
      <ScrollView
        ref={scrollRef}
        onScroll={trackScroll}
        scrollEventThrottle={16}
        contentContainerClassName="px-5 pt-2 pb-16"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        // Room for the keyboard, so a comment box can scroll above it
        automaticallyAdjustKeyboardInsets
      >
        {/* --- HERO: the date's photo, or one of its ideas' --- */}
        <Pressable
          onPress={heroPhoto ? () => setViewing({list: photos, at: photos.indexOf(heroPhoto)}) : undefined}
          disabled={!heroPhoto}
          accessibilityRole={heroPhoto ? "imagebutton" : undefined}
          accessibilityLabel={heroPhoto ? "Photo from the date. Open" : undefined}
          className={`${heroPhoto ? "h-72" : "h-44"} rounded-3xl overflow-hidden border border-zinc-800 mb-5`}
        >
          <Image
            source={
              heroPhoto
                ? {uri: heroPhoto.url ?? heroPhoto.thumbUrl ?? undefined, cacheKey: heroPhoto.storage_path}
                : coverImage(itinerary)
            }
            placeholder={
              heroPhoto?.thumbUrl ? {uri: heroPhoto.thumbUrl, cacheKey: heroPhoto.thumb_path ?? undefined} : undefined
            }
            style={{width: "100%", height: "100%"}}
            contentFit="cover"
            transition={150}
          />
          <View className={`absolute inset-0 ${heroPhoto ? "bg-black/10" : "bg-black/30"}`} />
          {photos.length > 0 && (
            <View className="absolute bottom-3 right-3 flex-row items-center gap-1 bg-black/55 rounded-full px-2.5 py-1">
              <Ionicons name="images" size={12} color="white" />
              <Text className="text-white text-xs font-bold">
                {photos.length} {photos.length === 1 ? "photo" : "photos"}
              </Text>
            </View>
          )}
          <View
            className={`absolute top-4 left-4 px-3 py-1.5 rounded-full border ${badge.className}`}
          >
            <Text className={`font-bold text-xs ${badge.text}`}>
              {badge.label}
            </Text>
          </View>
        </Pressable>

        {/* --- YOUR PARTNER'S DATE (view only) --- */}
        {partnersDate && (
          <View className="flex-row items-center gap-2 bg-pink-500/10 border border-pink-500/30 rounded-2xl px-4 py-3 mb-5">
            <Ionicons name="heart" size={16} color="#f472b6" />
            <Text className="text-pink-100/90 text-sm flex-1">
              Planned by {partner ? `@${partner.username}` : "your person"}. You can see it because you&apos;re
              linked.
            </Text>
          </View>
        )}

        {/* --- AN INVITE, waiting for your answer --- */}
        {pending && (
          <View className="bg-blue-500/10 border border-blue-500/40 rounded-3xl p-4 mb-5 gap-3">
            <Text className="text-white font-bold text-base">{ownerName} invited you to this date</Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => onAnswer(false)}
                disabled={busy !== null}
                className="flex-1 h-11 rounded-2xl bg-zinc-800 items-center justify-center active:opacity-80"
              >
                {busy === "decline" ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-zinc-200 font-bold">Decline</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => onAnswer(true)}
                disabled={busy !== null}
                className="flex-1 h-11 rounded-2xl bg-white items-center justify-center active:opacity-80"
              >
                {busy === "accept" ? (
                  <ActivityIndicator color="black" />
                ) : (
                  <Text className="text-black font-bold">I&apos;m in</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* --- TITLE --- */}
        {editingTitle ? (
          <View className="flex-row items-center gap-2 mb-1">
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              autoFocus
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={saveTitle}
              className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-2xl border border-zinc-700 font-bold"
              // fontSize in style: Tailwind text sizes clip iOS TextInput text
              style={{fontSize: 20}}
            />
            <Pressable
              onPress={saveTitle}
              disabled={busy === "rename"}
              className="bg-white rounded-xl px-4 py-3 active:opacity-80"
            >
              {busy === "rename" ? (
                <ActivityIndicator color="black" />
              ) : (
                <Text className="text-black font-bold">Save</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setTitleDraft(itinerary.title);
              setEditingTitle(true);
            }}
            disabled={!canEdit}
            accessibilityLabel={canEdit ? "Rename date" : undefined}
            className="flex-row items-center gap-2 mb-1"
          >
            <Text className="text-white font-extrabold text-2xl tracking-tight flex-shrink">
              {itinerary.title}
            </Text>
            {canEdit && <Ionicons name="pencil" size={16} color="#71717a" />}
          </Pressable>
        )}
        <Text className="text-zinc-400 text-base">
          {formatWhen(itinerary.starts_at)} • {stopCountLabel(itinerary)}
        </Text>

        {/* --- HEADS UP: the whole date (running late, into another date, …) --- */}
        {planCheck && planCheck.notes.length > 0 && (
          <View className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 gap-1.5">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="alert-circle" size={15} color="#fbbf24" />
              <Text className="text-amber-200 font-bold text-sm">Heads up</Text>
            </View>
            {planCheck.notes.map((note) => (
              <Text key={note} className="text-amber-100/80 text-sm">
                {note}
              </Text>
            ))}
            {canEditStops && (
              <Text className="text-amber-100/50 text-xs mt-0.5">Tap Edit to replace or remove a stop.</Text>
            )}
          </View>
        )}

        {/* --- STOPS: tap one for its idea page; the bubble opens its comments --- */}
        {canEditStops && (
          <View className="flex-row items-center justify-between mt-6 px-1">
            <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Stops</Text>
            <Pressable
              onPress={() => setEditing((e) => !e)}
              disabled={busy === "edit"}
              hitSlop={8}
              accessibilityRole="button"
              className="flex-row items-center gap-1 active:opacity-60"
            >
              {busy === "edit" ? (
                <ActivityIndicator color="#60a5fa" size="small" />
              ) : (
                <>
                  <Ionicons name={editing ? "checkmark" : "create-outline"} size={15} color="#60a5fa" />
                  <Text className="text-blue-400 font-semibold text-sm">{editing ? "Done" : "Edit"}</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
        <View className={`${canEditStops ? "mt-2" : "mt-6"} gap-3`}>
          {itinerary.stops.map((stop, index) => {
            // Its place among the stops you can see (what editing works on)
            const visibleIndex = itinerary.stops.slice(0, index).filter((s) => s.activity).length;
            const thread = threadOf(stop.stop_id);
            const unseen = hasUnseen(stop.stop_id);
            const open = openThreads.has(stop.stop_id);
            return (
            <View key={stop.stop_id}>
            <Pressable
              onPress={() =>
                stop.activity &&
                router.push({pathname: "/idea/[id]", params: {id: String(stop.activity.idea_id)}})
              }
              disabled={!stop.activity}
              accessibilityRole="button"
              className={`flex-row items-center bg-zinc-900 border border-zinc-800 p-3 active:opacity-80 ${
                open && !editing ? "rounded-t-2xl border-b-0" : "rounded-2xl"
              }`}
            >
              <View className="w-8 h-8 rounded-full bg-zinc-800 items-center justify-center mr-3">
                <Text className="text-white font-bold">{index + 1}</Text>
              </View>
              {stop.activity?.image_urls?.[0] ? (
                <Image
                  source={{uri: sizedImage(stop.activity.image_urls[0], 52)}}
                  style={{width: 52, height: 52, borderRadius: 12, marginRight: 12}}
                  contentFit="cover"
                />
              ) : null}
              <View className="flex-1">
                {stop.activity ? (
                  <>
                    <Text className="text-white font-bold text-base" numberOfLines={1}>
                      {stop.activity.title}
                    </Text>
                    <Text className="text-zinc-400 text-sm" numberOfLines={1}>
                      {[
                        stop.starts_at && stop.ends_at
                          ? `${formatTimeOfDay(stop.starts_at)} – ${formatTimeOfDay(stop.ends_at)}`
                          : null,
                        stop.activity.venues?.name,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </Text>
                    {/* What's off at this stop (the builder's check), e.g. closed then */}
                    {(() => {
                      const warning = planCheck?.byStop.get(stop.activity.idea_id);
                      if (!warning) return null;
                      const hard = warning.severity === "hard";
                      return (
                        <View className="flex-row items-center gap-1 mt-0.5">
                          <Ionicons name="alert-circle-outline" size={12} color={hard ? "#fb923c" : "#fbbf24"} />
                          <Text
                            className={`text-xs font-semibold shrink ${hard ? "text-orange-400" : "text-amber-300"}`}
                            numberOfLines={2}
                          >
                            {warning.message}
                          </Text>
                        </View>
                      );
                    })()}
                  </>
                ) : (
                  <Text className="text-zinc-500 italic">
                    This stop is no longer available
                  </Text>
                )}
              </View>
              {/* Its comments: the count, lit up when there's something new */}
              {showComments && !editing && (
                <Pressable
                  onPress={() => toggleThread(stop.stop_id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${thread.length} comment${thread.length === 1 ? "" : "s"}${
                    unseen ? ", new" : ""
                  }. ${open ? "Hide" : "Show"} comments`}
                  className={`flex-row items-center gap-1 ml-2 px-2.5 h-8 rounded-full ${
                    unseen ? "bg-blue-500" : open ? "bg-zinc-700" : "bg-zinc-800"
                  }`}
                >
                  <Ionicons
                    name={thread.length ? "chatbubble" : "chatbubble-outline"}
                    size={14}
                    color={unseen ? "white" : "#a1a1aa"}
                  />
                  {thread.length > 0 && (
                    <Text className={`text-xs font-bold ${unseen ? "text-white" : "text-zinc-300"}`}>
                      {thread.length}
                    </Text>
                  )}
                </Pressable>
              )}
            </Pressable>
            {/* Editing: replace or remove this stop */}
            {editing && stop.activity && (
              <View className="flex-row gap-2 mt-2">
                <Pressable
                  onPress={() => setReplacing(visibleIndex)}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Replace ${stop.activity.title}`}
                  className="flex-1 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex-row items-center justify-center gap-1.5 active:opacity-80"
                >
                  <Ionicons name="swap-horizontal" size={16} color="#60a5fa" />
                  <Text className="text-blue-400 font-bold text-sm">Replace</Text>
                </Pressable>
                <Pressable
                  onPress={() => removeStop(visibleIndex)}
                  disabled={busy !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${stop.activity.title}`}
                  className="flex-1 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex-row items-center justify-center gap-1.5 active:opacity-80"
                >
                  <Ionicons name="trash-outline" size={15} color="#f87171" />
                  <Text className="text-red-400 font-bold text-sm">Remove</Text>
                </Pressable>
              </View>
            )}
            {/* Photos taken here */}
            {!editing &&
              (() => {
                const here = photos.filter((p) => p.activity_id != null && p.activity_id === stop.activity?.idea_id);
                if (!here.length) return null;
                return <PhotoStrip photos={here} onOpen={(i) => setViewing({list: here, at: i})} />;
              })()}
            {open && !editing && (
              <View className="bg-zinc-900/60 border border-zinc-800 border-t-zinc-800/60 rounded-b-2xl overflow-hidden">
                <CommentThread
                  itineraryId={itineraryId}
                  stopId={stop.stop_id}
                  comments={thread}
                  members={members}
                  myUserId={myUserId}
                  canComment={canComment}
                  isOwner={isOwner}
                  onChanged={loadSharing}
                  onInputFocus={revealInput}
                />
              </View>
            )}
            </View>
            );
          })}
        </View>

        {/* Photos not from a stop on it: the end of the date, or a stop
            taken off since */}
        {otherPhotos.length > 0 && (
          <View className="mt-6 gap-2">
            <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-1">More photos</Text>
            <PhotoStrip photos={otherPhotos} onOpen={(i) => setViewing({list: otherPhotos, at: i})} />
          </View>
        )}

        {/* --- A SURPRISE: hidden from your partner (#35) --- */}
        {canSurprise && (
          <View className="mt-8 gap-2">
            <View className="flex-row items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-3xl px-4 py-3">
              <Ionicons name="gift-outline" size={20} color={itinerary.is_surprise ? "#f472b6" : "white"} />
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">Surprise for @{partner!.username}</Text>
                <Text className="text-zinc-500 text-xs">
                  {itinerary.is_surprise
                    ? "Hidden from them until you invite them or it's over"
                    : "They can see this date"}
                </Text>
              </View>
              <Switch
                value={itinerary.is_surprise}
                onValueChange={toggleSurprise}
                disabled={busy !== null}
                trackColor={{true: "#f472b6"}}
                accessibilityLabel={`Surprise for ${partner!.username}`}
              />
            </View>
          </View>
        )}

        {/* --- COMMENTS ON THE WHOLE DATE, THEN WHO'S ON IT (#36) --- */}
        {showComments && (
          <DateComments
            itinerary={itinerary}
            members={members}
            comments={comments}
            myUserId={myUserId}
            canComment={canComment}
            isOwner={isOwner}
            onChanged={loadSharing}
            onInputFocus={revealInput}
          />
        )}
        <DatePeople
          itineraryId={itineraryId}
          isOwner={isOwner}
          myUserId={myUserId}
          members={members}
          onChanged={onSharingChanged}
        />

        {/* --- ACTIONS --- */}
        <View className="mt-8 gap-3">
          {canEdit && itinerary.status === "PLANNED" && (
            <Pressable
              onPress={onStart}
              disabled={busy !== null}
              className="bg-white rounded-2xl h-14 items-center justify-center active:opacity-80"
            >
              {busy === "start" ? (
                <ActivityIndicator color="black" />
              ) : (
                <Text className="text-black font-extrabold text-base">
                  Start now
                </Text>
              )}
            </Pressable>
          )}

          {accepted && itinerary.status === "ACTIVE" && (
            <>
              <Pressable
                onPress={() => router.push("/active-date")}
                className="bg-white rounded-2xl h-14 items-center justify-center active:opacity-80"
              >
                <Text className="text-black font-extrabold text-base">
                  Open live view
                </Text>
              </Pressable>
              {canEdit && (
                <Pressable
                  onPress={onEnd}
                  disabled={busy !== null}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl h-14 items-center justify-center active:bg-zinc-800"
                >
                  {busy === "end" ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      End date
                    </Text>
                  )}
                </Pressable>
              )}
            </>
          )}

          {/* The owner deletes it for everyone; anyone else just leaves */}
          {isOwner ? (
            <Pressable
              onPress={onDelete}
              disabled={busy !== null}
              className="h-12 items-center justify-center"
            >
              {busy === "delete" ? (
                <ActivityIndicator color="#f87171" />
              ) : (
                <Text className="text-red-400 font-semibold">Delete date</Text>
              )}
            </Pressable>
          ) : accepted ? (
            <Pressable
              onPress={onLeave}
              disabled={busy !== null}
              className="h-12 items-center justify-center"
            >
              {busy === "leave" ? (
                <ActivityIndicator color="#f87171" />
              ) : (
                <Text className="text-red-400 font-semibold">Leave this date</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <ReplaceSheet
        itinerary={itinerary}
        index={replacing}
        onClose={() => setReplacing(null)}
        onPick={(replacement) => replacing != null && replaceStop(replacing, replacement)}
      />
      <PhotoViewer
        photos={viewing?.list.filter((p) => photos.includes(p)) ?? []}
        startAt={viewing ? Math.max(0, viewing.at) : null}
        myUserId={myUserId}
        nameOf={photoName}
        onClose={() => setViewing(null)}
      />
    </SafeAreaView>
  );
}

/** A row of photos (a stop's, or the rest); tap one to see it full screen */
function PhotoStrip({photos, onOpen}: {photos: Capture[]; onOpen: (index: number) => void}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-2"
      contentContainerStyle={{gap: 6, paddingLeft: 44}}
    >
      {photos.map((p, i) => (
        <Pressable
          key={p.capture_id}
          onPress={() => onOpen(i)}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
          className="active:opacity-80"
        >
          <Image
            source={{uri: p.thumbUrl ?? undefined, cacheKey: p.thumb_path ?? p.storage_path}}
            style={{width: 66, height: 88, borderRadius: 12, backgroundColor: "#18181b"}}
            contentFit="cover"
            transition={120}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}
