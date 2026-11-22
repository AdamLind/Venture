// app/moderation.tsx
// The moderation queue (#26): ideas waiting for review (oldest first), ideas
// with open reports (most reported first), and the log of decisions.
// Opening one shows the idea as everyone will see it, with the staff review
// panel on top. Staff only (Settings shows the way in).

import React, {useCallback, useState} from "react";
import {ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View} from "react-native";
import Toast from "react-native-toast-message";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect, useRouter} from "expo-router";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";

import ScreenHeader from "@/components/ui/ScreenHeader";
import {ideaImage} from "@/src/lib/ideas";
import {
  REPORT_REASON_LABEL,
  type LogEntry,
  type QueueIdea,
  type ReportedIdea,
  type SuspendedAccount,
  ago,
  fetchLog,
  fetchReported,
  fetchSuspended,
  fetchToReview,
  logLine,
  setSuspension,
} from "@/src/lib/moderation";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useStaffStore} from "@/src/store/useStaffStore";

type Tab = "review" | "reported" | "suspended" | "log";
type IconName = React.ComponentProps<typeof Ionicons>["name"];

const EMPTY: Record<Tab, {icon: IconName; title: string; body: string}> = {
  review: {icon: "checkmark-done-outline", title: "All caught up", body: "New ideas show up here when they're posted."},
  reported: {icon: "flag-outline", title: "No open reports", body: "Reported ideas show up here, most reported first."},
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
  const [reported, setReported] = useState<ReportedIdea[] | null>(null);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [suspended, setSuspended] = useState<SuspendedAccount[] | null>(null);
  const [lifting, setLifting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b, c, d] = await Promise.all([
        fetchToReview(),
        fetchReported(),
        fetchLog(),
        fetchSuspended(),
      ]);
      setToReview(a);
      setReported(b);
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
  const lift = (account: SuspendedAccount) => {
    const name = account.username ? `@${account.username}` : "this account";
    Alert.alert(`Lift the suspension on ${name}?`, "They can publish and report again.", [
      {text: "Cancel", style: "cancel"},
      {
        text: "Lift it",
        onPress: async () => {
          setLifting(account.user_id);
          try {
            await setSuspension(account.user_id, false, null);
            Toast.show({type: "success", text1: "Suspension lifted", position: "bottom"});
            await load();
          } catch (e) {
            Alert.alert("Couldn't lift it", e instanceof Error ? e.message : "Please try again.");
          } finally {
            setLifting(null);
          }
        },
      },
    ]);
  };

  const open = (ideaId: number) =>
    router.push({pathname: "/idea/[id]", params: {id: String(ideaId), review: "1", from: "queue"}});

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
    tab === "review" ? toReview : tab === "reported" ? reported : tab === "suspended" ? suspended : log;
  const empty = EMPTY[tab];

  return (
    <SafeAreaView edges={["top"]} style={{flex: 1, backgroundColor: "#000"}}>
      <ScreenHeader title="Moderation" />

      {/* TABS */}
      <View className="flex-row mx-5 mt-2 mb-3 bg-zinc-900 rounded-2xl p-1 border border-zinc-800">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              className={`flex-1 h-9 rounded-xl flex-row items-center justify-center gap-1.5 ${active ? "bg-zinc-700" : ""}`}
            >
              <Text className={`text-sm font-bold ${active ? "text-white" : "text-zinc-400"}`} numberOfLines={1}>
                {t.label}
              </Text>
              {t.count ? (
                <View
                  className={`min-w-5 h-5 px-1.5 rounded-full items-center justify-center ${t.key === "reported" ? "bg-red-500" : "bg-amber-500"}`}
                >
                  <Text className="text-black text-xs font-extrabold">{t.count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
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
            String(tab === "log" ? item.action_id : tab === "suspended" ? item.user_id : item.idea_id)
          }
          contentContainerClassName="px-5 pb-16 gap-3"
          contentContainerStyle={data.length === 0 ? {flexGrow: 1} : undefined}
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
              <ReportedRow idea={item} onPress={() => open(item.idea_id)} />
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
                onPress={item.idea_id ? () => open(item.idea_id) : undefined}
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function Thumb({idea}: {idea: {image_urls: string[] | null}}) {
  return (
    <Image source={{uri: ideaImage(idea)}} style={{width: 56, height: 56, borderRadius: 14}} contentFit="cover" />
  );
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
        {mine && !canReviewOwn && (
          <Text className="text-zinc-500 text-xs">Someone else needs to review it</Text>
        )}
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

function LogRow({
  entry,
  myUsername,
  onPress,
}: {
  entry: LogEntry;
  myUsername: string | null;
  onPress?: () => void;
}) {
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
