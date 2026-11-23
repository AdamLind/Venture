// app/reported-person/[id].tsx
// A reported person, for moderators (#76): their photo and name (what's
// usually reported), the open reports about them, what's been done before,
// and what to do now: remove their photo or name, reset their username,
// suspend them, or close the reports (handled another way, or nothing wrong).
// Opened from Moderation › Reported, the log, or a staff alert.
// The database checks every decision (handle_person_reports) and logs it.

import React, {useCallback, useState} from "react";
import {ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect, useLocalSearchParams} from "expo-router";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import ScreenHeader from "@/components/ui/ScreenHeader";
import Avatar from "@/components/profile/Avatar";
import {
  type PersonOutcome,
  type PersonReview,
  ago,
  fetchPersonReview,
  handlePersonReports,
  personHistoryLine,
} from "@/src/lib/moderation";
import {PERSON_REPORT_REASON_LABEL} from "@/src/lib/reportPerson";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useStaffStore} from "@/src/store/useStaffStore";
import {showDone, showError} from "@/src/lib/notify";
import {type SheetIcon, prompt} from "@/src/lib/sheets";

const CONTEXT_LABEL = {CONNECTION: "From their connection", DATE: "From a date they're on"} as const;

/** What each outcome asks, and says once it's done */
const OUTCOMES: Record<
  PersonOutcome,
  {
    label: string;
    icon: SheetIcon;
    destructive?: boolean;
    title: (who: string) => string;
    message: (who: string) => string;
    placeholder: string;
    submit: string;
    /** The note goes to them, so it's required */
    noteRequired: boolean;
    done: string;
  }
> = {
  REMOVE_PHOTO: {
    label: "Remove their photo",
    icon: "image-outline",
    destructive: true,
    title: (who) => `Remove ${who}'s photo?`,
    message: () => "It's taken down everywhere, and they're told why. They can add a new one.",
    placeholder: "Why it was removed (they'll see this)",
    submit: "Remove photo",
    noteRequired: true,
    done: "Photo removed",
  },
  REMOVE_NAME: {
    label: "Remove their name",
    icon: "person-remove-outline",
    destructive: true,
    title: (who) => `Remove ${who}'s name?`,
    message: () => "Their first and last name are cleared, and they're told why. They can add new ones.",
    placeholder: "Why it was removed (they'll see this)",
    submit: "Remove name",
    noteRequired: true,
    done: "Name removed",
  },
  RESET_USERNAME: {
    label: "Reset their username",
    icon: "text-outline",
    destructive: true,
    title: (who) => `Reset ${who}'s username?`,
    message: () => "They get a placeholder (like user3f9a2c1d) and are asked to pick a new one. They're told why.",
    placeholder: "Why it was reset (they'll see this)",
    submit: "Reset username",
    noteRequired: true,
    done: "Username reset",
  },
  SUSPEND: {
    label: "Suspend their account",
    icon: "ban-outline",
    destructive: true,
    title: (who) => `Suspend ${who}?`,
    message: () =>
      "They can still plan privately, but can't publish or report, and their ideas leave Discover. They see the reason.",
    placeholder: "Why (they'll see this)",
    submit: "Suspend",
    noteRequired: true,
    done: "Account suspended",
  },
  RESOLVED: {
    label: "Handled another way",
    icon: "checkmark-done-outline",
    title: () => "Close the reports?",
    message: () => "For when you've dealt with it some other way. Whoever reported them hears it was looked at.",
    placeholder: "What you did (staff only, optional)",
    submit: "Close reports",
    noteRequired: false,
    done: "Reports closed",
  },
  DISMISSED: {
    label: "Nothing wrong",
    icon: "close-circle-outline",
    title: () => "Dismiss the reports?",
    message: (who) => `Nothing changes for ${who}. Whoever reported them hears it was looked at.`,
    placeholder: "Why (staff only, optional)",
    submit: "Dismiss",
    noteRequired: false,
    done: "Reports dismissed",
  },
};

export default function ReportedPersonScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const role = useStaffStore((s) => s.role);
  const myUserId = useProfileStore((s) => s.userId);
  const myUsername = useProfileStore((s) => s.profile?.username ?? null);

  // undefined: loading; null: nothing to show
  const [review, setReview] = useState<PersonReview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<PersonOutcome | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setReview(await fetchPersonReview(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load them");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const decide = async (outcome: PersonOutcome) => {
    if (!review) return;
    const who = review.person.username ? `@${review.person.username}` : "them";
    const o = OUTCOMES[outcome];
    const note = await prompt({
      title: o.title(who),
      message: o.message(who),
      placeholder: o.placeholder,
      maxLength: 1000,
      multiline: true,
      submitLabel: o.submit,
      destructive: o.destructive,
      optional: !o.noteRequired,
    });
    if (note == null) return;
    setBusy(outcome);
    try {
      await handlePersonReports(review.person.user_id, outcome, note);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showDone(o.done);
      await load();
    } catch (e) {
      showError("Couldn't do that", e);
    } finally {
      setBusy(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!role) {
    return (
      <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
        <ScreenHeader title="Reported person" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-zinc-400 text-center">This is for moderators.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (review === undefined || review === null) {
    return (
      <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
        <ScreenHeader title="Reported person" />
        <View className="flex-1 items-center justify-center px-8 gap-4">
          {error ? (
            <>
              <Text className="text-zinc-300 text-center">{error}</Text>
              <Pressable onPress={load} className="bg-white rounded-2xl px-6 py-3 active:opacity-80">
                <Text className="text-black font-bold">Try again</Text>
              </Pressable>
            </>
          ) : review === null ? (
            <Text className="text-zinc-400 text-center">
              Nothing to show. Their account may have been deleted, along with the reports about them.
            </Text>
          ) : (
            <ActivityIndicator color="white" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const {person, reports, history, suspended, isStaff} = review;
  const me = person.user_id === myUserId;
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  const photo = person.profile_image_url;
  const open = reports.length > 0;
  const outcomes: PersonOutcome[] = [
    ...(photo ? (["REMOVE_PHOTO"] as const) : []),
    ...(name ? (["REMOVE_NAME"] as const) : []),
    "RESET_USERNAME",
    ...(!suspended && !isStaff ? (["SUSPEND"] as const) : []),
    ...(open ? (["RESOLVED", "DISMISSED"] as const) : []),
  ];

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Reported person" />
      <ScrollView
        contentContainerClassName="px-5 pt-2 pb-16 gap-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />}
      >
        {/* WHO: the photo big enough to judge */}
        <View className="items-center gap-3">
          {photo ? (
            <Image
              source={{uri: photo}}
              style={{width: 200, height: 200, borderRadius: 100}}
              contentFit="cover"
              transition={150}
              accessibilityLabel={`${person.username ?? "Their"} photo`}
            />
          ) : (
            <Avatar profile={{username: person.username ?? "?", profile_image_url: null}} size={120} />
          )}
          <View className="items-center gap-0.5">
            <Text className="text-white font-extrabold text-2xl text-center" numberOfLines={2}>
              {person.username ? `@${person.username}` : "Someone"}
            </Text>
            {name ? <Text className="text-zinc-400">{name}</Text> : null}
          </View>
          {(suspended || isStaff) && (
            <View className="flex-row gap-2">
              {suspended && <Chip icon="ban" color="#f87171" label="Suspended" />}
              {isStaff && <Chip icon="shield-checkmark" color="#a78bfa" label="Staff" />}
            </View>
          )}
        </View>

        {/* THE REPORTS */}
        <View className="gap-2">
          <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-1">
            {open ? `${reports.length} open report${reports.length === 1 ? "" : "s"}` : "Reports"}
          </Text>
          <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
            {open ? (
              reports.map((r, i) => (
                <View
                  key={`${r.created_at}-${i}`}
                  className={`px-4 py-3 gap-1 ${i > 0 ? "border-t border-zinc-800" : ""}`}
                >
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="flag" size={13} color="#fca5a5" />
                    <Text className="text-white font-semibold flex-1">
                      {PERSON_REPORT_REASON_LABEL[r.reason] ?? r.reason}
                    </Text>
                    <Text className="text-zinc-500 text-xs">{ago(r.created_at)}</Text>
                  </View>
                  <Text className="text-zinc-500 text-xs">{CONTEXT_LABEL[r.context] ?? r.context}</Text>
                  {r.details ? <Text className="text-zinc-300 text-sm">“{r.details}”</Text> : null}
                </View>
              ))
            ) : (
              <Text className="text-zinc-400 px-4 py-3.5">{"No open reports. They've all been handled."}</Text>
            )}
          </View>
        </View>

        {/* WHAT TO DO */}
        {me ? (
          <Text className="text-zinc-400 text-center px-4">Someone else needs to handle reports about you.</Text>
        ) : (
          <View className="gap-2">
            <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-1">What to do</Text>
            <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              {outcomes.map((outcome, i) => {
                const o = OUTCOMES[outcome];
                return (
                  <Pressable
                    key={outcome}
                    onPress={() => decide(outcome)}
                    disabled={!!busy}
                    accessibilityRole="button"
                    className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-zinc-800 ${
                      i > 0 ? "border-t border-zinc-800" : ""
                    }`}
                  >
                    <Ionicons name={o.icon} size={18} color={o.destructive ? "#f87171" : "#a1a1aa"} />
                    <Text className={`font-semibold flex-1 ${o.destructive ? "text-red-400" : "text-white"}`}>
                      {o.label}
                    </Text>
                    {busy === outcome && <ActivityIndicator size="small" color="#a1a1aa" />}
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-zinc-600 text-xs px-1">
              Each of these closes the open reports. Whoever reported them hears it was looked at, never what was done.
            </Text>
          </View>
        )}

        {/* WHAT'S BEEN DONE BEFORE */}
        {history.length > 0 && (
          <View className="gap-2">
            <Text className="text-zinc-500 text-xs font-bold uppercase tracking-wider px-1">History</Text>
            <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              {history.map((entry, i) => (
                <View key={entry.action_id} className={`px-4 py-3 gap-1 ${i > 0 ? "border-t border-zinc-800" : ""}`}>
                  <View className="flex-row gap-2">
                    <Text className="text-zinc-200 text-sm flex-1">{personHistoryLine(entry, myUsername)}</Text>
                    <Text className="text-zinc-500 text-xs">{ago(entry.created_at)}</Text>
                  </View>
                  {entry.note ? <Text className="text-zinc-400 text-sm">“{entry.note}”</Text> : null}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({icon, color, label}: {icon: SheetIcon; color: string; label: string}) {
  return (
    <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{backgroundColor: `${color}26`}}>
      <Ionicons name={icon} size={12} color={color} />
      <Text className="text-xs font-extrabold" style={{color}}>
        {label}
      </Text>
    </View>
  );
}
