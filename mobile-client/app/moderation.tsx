// app/moderation.tsx
// The moderation queue (#26): ideas waiting for review (oldest first), ideas
// and people with open reports (most reported first, #76), and the log of
// decisions. Opening an idea shows it as everyone will see it, with the
// staff review panel on top; opening a person shows their review page
// (app/reported-person/[id].tsx). Staff only (Settings shows the way in).

import React, {useCallback, useMemo, useState} from "react";
import {ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View} from "react-native";
import Toast from "@/src/lib/toast";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect, useRouter} from "expo-router";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import ScreenHeader from "@/components/ui/ScreenHeader";
import Avatar from "@/components/profile/Avatar";
import {ideaImage} from "@/src/lib/ideas";
import {badgeCount} from "@/src/lib/text";
import {searchWords} from "@/src/lib/ideaSearch";
import {
  REPORT_REASON_LABEL,
  type LogEntry,
  type QueueIdea,
  type ReportedIdea,
  type ReportedPerson,
  type SuspendedAccount,
  ago,
  fetchLog,
  fetchReported,
  fetchReportedPeople,
  fetchSuspended,
  fetchToReview,
  logLine,
  PERSON_ACTIONS,
  setSuspension,
} from "@/src/lib/moderation";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useStaffStore} from "@/src/store/useStaffStore";
import {showError} from "@/src/lib/notify";
import {confirm} from "@/src/lib/sheets";
import {PERSON_REPORT_REASON_LABEL} from "@/src/lib/reportPerson";

type Tab = "review" | "reported" | "suspended" | "log";
type IconName = React.ComponentProps<typeof Ionicons>["name"];
/** The Reported tab: ideas and people, together */
type ReportedItem = ({kind: "idea"} & ReportedIdea) | ({kind: "person"} & ReportedPerson);

const EMPTY: Record<Tab, {icon: IconName; title: string; body: string}> = {
  review: {icon: "checkmark-done-outline", title: "All caught up", body: "New ideas show up here when they're posted."},
  reported: {
    icon: "flag-outline",
    title: "No open reports",
    body: "Reported ideas and people show up here, most reported first.",
  },
  suspended: {
    icon: "ban-outline",
    title: "Nobody's suspended",
    body: "Suspend a creator from the review panel on one of their ideas.",
  },
  log: {icon: "document-text-outline", title: "Nothing yet", body: "Every decision is logged here with who made it."},
};

export default function ModerationScreen() {
  const router = useRouter();
  const role = useStaffStore((s) => s.role);
  const refreshCounts = useStaffStore((s) => s.refreshCounts);
  const myUserId = useProfileStore((s) => s.userId);
  const myUsername = useProfileStore((s) => s.profile?.username ?? null);

  const [tab, setTab] = useState<Tab>("review");
  const [toReview, setToReview] = useState<QueueIdea[] | null>(null);
  const [reported, setReported] = useState<ReportedItem[] | null>(null);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [suspended, setSuspended] = useState<SuspendedAccount[] | null>(null);
  const [lifting, setLifting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // To review: find one among many (title, place or poster)
  const [search, setSearch] = useState("");
  const shownToReview = useMemo(() => {
    const words = searchWords(search);
    if (!toReview || !words.length) return toReview;
    return toReview.filter((idea) => {
      const text = searchWords([idea.title, idea.place, idea.username].filter(Boolean).join(" "));
      return words.every((w) => text.some((t) => t.startsWith(w)));
    });
  }, [toReview, search]);

  const load = useCallback(async () => {
    try {
      const [a, ideas, people, c, d] = await Promise.all([
        fetchToReview(),
        fetchReported(),
        fetchReportedPeople(),
        fetchLog(),
        fetchSuspended(),
      ]);
      setToReview(a);
      setReported(
        [
          ...ideas.map((idea) => ({kind: "idea" as const, ...idea})),
          ...people.map((person) => ({kind: "person" as const, ...person})),
        ].sort((x, y) => y.reports.length - x.reports.length),
      );
      setLog(c);
      setSuspended(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the queue");
    }
    refreshCounts();
  }, [refreshCounts]);

  // On focus: coming back from a decision shows the queue without it
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Lift a suspension: works even when none of their ideas are left to open
  const lift = async (account: SuspendedAccount) => {
    const name = account.username ? `@${account.username}` : "this account";
    const ok = await confirm({
      title: `Lift the suspension on ${name}?`,
      message: "They can publish and report again.",
      confirmLabel: "Lift it",
      icon: "lock-open-outline",
    });
    if (!ok) return;
    setLifting(account.user_id);
    try {
      await setSuspension(account.user_id, false, null);
      Toast.show({type: "success", text1: "Suspension lifted"});
      await load();
    } catch (e) {
      showError("Couldn't lift it", e);
    } finally {
      setLifting(null);
    }
  };

  const open = (ideaId: number) =>
    router.push({pathname: "/idea/[id]", params: {id: String(ideaId), review: "1", from: "queue"}});
  const openPerson = (userId: string) => router.push({pathname: "/reported-person/[id]", params: {id: userId}});

  if (!role) {
    return (
      <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
        <ScreenHeader title="Moderation" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-zinc-400 text-center">This is for moderators.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tabs: {key: Tab; label: string; count?: number}[] = [
    {key: "review", label: "To review", count: toReview?.length},
    {key: "reported", label: "Reported", count: reported?.length},
    {key: "suspended", label: "Suspended"},
    {key: "log", label: "Log"},
  ];
  const data: any[] | null =
    tab === "review" ? shownToReview : tab === "reported" ? reported : tab === "suspended" ? suspended : log;
  // (searching the review queue and nothing matches: not "all caught up")
  const empty: (typeof EMPTY)[Tab] =
    tab === "review" && search.trim() && toReview?.length
      ? {icon: "search-outline", title: "No match", body: "Nothing waiting matches that."}
      : EMPTY[tab];

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Moderation" />

      {/* TABS: chips as wide as their label and count, in a row that
          scrolls sideways if it's wider than the screen (four equal tabs
          squeezed "To review 99+") */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-5 gap-2"
          className="mt-2 mb-3 grow-0"
          accessibilityRole="tablist"
        >
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{selected: active}}
                accessibilityLabel={t.count ? `${t.label}, ${t.count}` : t.label}
                className={`h-9 px-4 rounded-full flex-row items-center gap-2 border ${
                  active ? "bg-white border-white" : "bg-zinc-900 border-zinc-800 active:bg-zinc-800"
                }`}
              >
                <Text className={`text-sm font-bold ${active ? "text-black" : "text-zinc-300"}`}>{t.label}</Text>
                {t.count ? (
                  <View
                    className={`min-w-5 h-5 px-1.5 rounded-full items-center justify-center ${
                      t.key === "reported" ? "bg-red-500" : "bg-amber-500"
                    }`}
                  >
                    <Text className="text-black text-xs font-extrabold">{badgeCount(t.count)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error && !data ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <Text className="text-zinc-300 text-center">{error}</Text>
          <Pressable onPress={load} className="bg-white rounded-2xl px-6 py-3 active:opacity-80">
            <Text className="text-black font-bold">Try again</Text>
          </Pressable>
        </View>
      ) : !data ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="white" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) =>
            tab === "log"
              ? String(item.action_id)
              : tab === "suspended"
                ? item.user_id
                : tab === "reported" && item.kind === "person"
                  ? `person-${item.user_id}`
                  : String(item.idea_id)
          }
          contentContainerClassName="px-5 pb-16 gap-3"
          contentContainerStyle={data.length === 0 ? {flexGrow: 1} : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // To review: how many in all (the tab's badge stops at 99+), and a
          // search for finding one among them
          ListHeaderComponent={
            tab === "review" && toReview && toReview.length > 0 ? (
              <View className="gap-2.5 mb-1">
                <Text className="text-zinc-400 text-sm ml-1">
                  {search.trim()
                    ? `${shownToReview?.length ?? 0} of ${toReview.length} waiting`
                    : `${toReview.length} waiting, oldest first`}
                </Text>
                <View className="flex-row items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 h-10">
                  <Ionicons name="search" size={15} color="#71717a" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Title, place or @poster"
                    placeholderTextColor="#71717a"
                    autoCorrect={false}
                    autoCapitalize="none"
                    accessibilityLabel="Search the ideas waiting for review"
                    className="flex-1 text-white"
                    style={{fontSize: 15}}
                  />
                  {search ? (
                    <Pressable onPress={() => setSearch("")} hitSlop={10} accessibilityLabel="Clear search">
                      <Ionicons name="close-circle" size={17} color="#71717a" />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : undefined
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8 gap-2 pb-24">
              <Ionicons name={empty.icon} size={36} color="#52525b" />
              <Text className="text-white font-bold text-lg">{empty.title}</Text>
              <Text className="text-zinc-500 text-center">{empty.body}</Text>
            </View>
          }
          renderItem={({item}) =>
            tab === "review" ? (
              <ReviewRow
                idea={item}
                mine={item.user_id === myUserId}
                canReviewOwn={role === "ADMIN"}
                onPress={() => open(item.idea_id)}
              />
            ) : tab === "reported" ? (
              item.kind === "person" ? (
                <ReportedPersonRow person={item} onPress={() => openPerson(item.user_id)} />
              ) : (
                <ReportedRow idea={item} onPress={() => open(item.idea_id)} />
              )
            ) : tab === "suspended" ? (
              <SuspendedRow
                account={item}
                myUsername={myUsername}
                busy={lifting === item.user_id}
                onLift={() => lift(item)}
              />
            ) : (
              <LogRow
                entry={item}
                myUsername={myUsername}
                onPress={
                  item.idea_id
                    ? () => open(item.idea_id)
                    : item.user_id && PERSON_ACTIONS.includes(item.action)
                      ? () => openPerson(item.user_id)
                      : undefined
                }
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function Thumb({idea}: {idea: Parameters<typeof ideaImage>[0]}) {
  return <Image source={ideaImage(idea)} style={{width: 56, height: 56, borderRadius: 14}} contentFit="cover" />;
}

function ReviewRow({
  idea,
  mine,
  canReviewOwn,
  onPress,
}: {
  idea: QueueIdea;
  mine: boolean;
  canReviewOwn: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-3 gap-3 active:opacity-80"
    >
      <Thumb idea={idea} />
      <View className="flex-1 gap-0.5">
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {idea.title}
        </Text>
        <Text className="text-zinc-400 text-sm" numberOfLines={1}>
          {mine ? "Your idea" : idea.username ? `@${idea.username}` : "Someone"}
          {idea.place ? ` · ${idea.place}` : ""}
        </Text>
        {/* Approving it makes its place public too (#88) */}
        {idea.newPlace && (
          <View className="self-start flex-row items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-orange-500/15">
            <Ionicons name="pin" size={11} color="#fdba74" />
            <Text className="text-orange-200 text-xs font-bold">New place</Text>
          </View>
        )}
        {mine && !canReviewOwn && <Text className="text-zinc-500 text-xs">Someone else needs to review it</Text>}
      </View>
      <View className="items-end gap-1">
        <Text className="text-amber-400 text-xs font-bold">{ago(idea.submitted_at ?? idea.created_at)}</Text>
        <Ionicons name="chevron-forward" size={16} color="#52525b" />
      </View>
    </Pressable>
  );
}

function ReportedRow({idea, onPress}: {idea: ReportedIdea; onPress: () => void}) {
  const reasons = [...new Set(idea.reports.map((r) => r.reason))];
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-3 gap-3 active:opacity-80"
    >
      <Thumb idea={idea} />
      <View className="flex-1 gap-1">
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {idea.title}
        </Text>
        <Text className="text-zinc-400 text-sm" numberOfLines={1}>
          {reasons.map((r) => REPORT_REASON_LABEL[r] ?? r).join(", ")}
        </Text>
      </View>
      <View className="items-end gap-1">
        <View className="flex-row items-center gap-1.5">
          {/* Out of Discover until someone looks */}
          {idea.held && (
            <View
              className="flex-row items-center gap-1 bg-amber-500/15 rounded-full px-2 py-0.5"
              accessibilityLabel="Hidden from Discover"
            >
              <Ionicons name="eye-off" size={11} color="#fcd34d" />
              <Text className="text-amber-300 text-xs font-extrabold">Hidden</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1 bg-red-500/15 rounded-full px-2 py-0.5">
            <Ionicons name="flag" size={11} color="#fca5a5" />
            <Text className="text-red-300 text-xs font-extrabold">{idea.reports.length}</Text>
          </View>
        </View>
        <Text className="text-zinc-500 text-xs">{ago(idea.reports[0]?.created_at ?? null)}</Text>
      </View>
    </Pressable>
  );
}

/** Someone reported: their photo and name (what's often reported), and why */
function ReportedPersonRow({person, onPress}: {person: ReportedPerson; onPress: () => void}) {
  const reasons = [...new Set(person.reports.map((r) => r.reason))];
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-3 gap-3 active:opacity-80"
    >
      <Avatar
        profile={{username: person.username ?? "?", profile_image_url: person.profile_image_url}}
        size={56}
        small
      />
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="person" size={12} color="#a1a1aa" />
          <Text className="text-white font-bold text-base flex-shrink" numberOfLines={1}>
            {person.username ? `@${person.username}` : "Someone"}
          </Text>
        </View>
        <Text className="text-zinc-400 text-sm" numberOfLines={1}>
          {reasons.map((r) => PERSON_REPORT_REASON_LABEL[r] ?? r).join(", ")}
        </Text>
      </View>
      <View className="items-end gap-1">
        <View className="flex-row items-center gap-1 bg-red-500/15 rounded-full px-2 py-0.5">
          <Ionicons name="flag" size={11} color="#fca5a5" />
          <Text className="text-red-300 text-xs font-extrabold">{person.reports.length}</Text>
        </View>
        <Text className="text-zinc-500 text-xs">{ago(person.reports[0]?.created_at ?? null)}</Text>
      </View>
    </Pressable>
  );
}

function SuspendedRow({
  account,
  myUsername,
  busy,
  onLift,
}: {
  account: SuspendedAccount;
  myUsername: string | null;
  busy: boolean;
  onLift: () => void;
}) {
  const by = account.suspended_by
    ? account.suspended_by === myUsername
      ? "you"
      : `@${account.suspended_by}`
    : "a moderator";
  return (
    <View className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-4 gap-3">
      <Ionicons name="ban-outline" size={22} color="#f87171" />
      <View className="flex-1 gap-0.5">
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {account.username ? `@${account.username}` : "An account"}
        </Text>
        <Text className="text-zinc-300 text-sm" numberOfLines={2}>
          {account.reason}
        </Text>
        <Text className="text-zinc-500 text-xs">
          By {by} · {ago(account.created_at)} ago
        </Text>
      </View>
      <Pressable
        onPress={onLift}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Lift the suspension on ${account.username ?? "this account"}`}
        className="bg-zinc-800 rounded-full px-4 py-2 active:opacity-70"
      >
        {busy ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Text className="text-white font-bold text-sm">Lift</Text>
        )}
      </Pressable>
    </View>
  );
}

function LogRow({entry, myUsername, onPress}: {entry: LogEntry; myUsername: string | null; onPress?: () => void}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="bg-zinc-900 border border-zinc-800 rounded-3xl px-4 py-3 gap-1 active:opacity-80"
    >
      <View className="flex-row gap-2">
        <Text className="text-zinc-200 text-sm flex-1">{logLine(entry, myUsername)}</Text>
        <Text className="text-zinc-500 text-xs">{ago(entry.created_at)}</Text>
      </View>
      {entry.note ? <Text className="text-zinc-400 text-sm">“{entry.note}”</Text> : null}
    </Pressable>
  );
}
