import React, {useCallback, useMemo, useState} from "react";
import {View, Text, Pressable, ActivityIndicator, Animated} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect, useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";

import Avatar from "@/components/profile/Avatar";
import TabHeader, {
  HeaderIconButton,
  useTabHeader,
  useTabRefresh,
} from "@/components/ui/TabHeader";
import {useProfileStore} from "@/src/store/useProfileStore";
import {displayName, hasHomeArea} from "@/src/lib/profile";
import {DATES_FOR_TITLES, type EarnedTitle, earnedTitles, titleLayout} from "@/utils/titles";
import {showInfo} from "@/src/lib/notify";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {groupItineraries} from "@/src/lib/dates";
import {UpNextCard} from "@/components/dates/DateCards";
import MemoriesGrid from "@/components/dates/MemoriesGrid";
import {MyIdeaRow} from "@/components/ideas/IdeaRows";
import SavedList from "@/components/ideas/SavedList";
import {useSavedStore} from "@/src/store/useSavedStore";
import {useMyIdeasStore} from "@/src/store/useMyIdeasStore";
import {showIdeaActions} from "@/src/lib/ideaActions";
import type {IdeaVisibility} from "@/types/ideas";
import {useConnectionsStore} from "@/src/store/useConnectionsStore";
import {badgeCount} from "@/src/lib/text";

type Tab = "memories" | "bucket" | "ideas";
type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: {key: Tab; label: string}[] = [
  {key: "memories", label: "Memories"},
  {key: "bucket", label: "Saved"},
  {key: "ideas", label: "My Ideas"},
];

const EMPTY_STATES: Record<Tab, {icon: IconName; title: string; body: string}> =
  {
    memories: {
      icon: "images-outline",
      title: "No memories yet",
      body: "Dates you go on show up here, with the photos you take during them.",
    },
    bucket: {
      icon: "bookmark-outline",
      title: "Nothing saved yet",
      body: "Tap the bookmark on any idea in Discover to save it, whether it's a someday or a favorite.",
    },
    ideas: {
      icon: "bulb-outline",
      title: "No ideas shared yet",
      body: "Share a date idea and you'll see where it is in review here.",
    },
  };

// My Ideas, grouped by what they need from you. The reviewer outcomes you
// can act on (edit and resubmit, withdraw, or delete) come first, in a
// highlighted "Needs your attention" panel, still grouped by status.
const ATTENTION_GROUPS: {title: string; status: IdeaVisibility}[] = [
  {title: "Needs changes", status: "NEEDS_REVISION"},
  {title: "Not approved", status: "REJECTED"},
];
const IDEA_SECTIONS: {title: string; status: IdeaVisibility}[] = [
  {title: "In review", status: "PENDING_REVIEW"},
  {title: "Live", status: "PUBLISHED"},
  {title: "Private", status: "PRIVATE"},
];
const ATTENTION_COLOR = "#fb923c";

const TITLE_COLOR = "#fbbf24";

/** One title: the main one (the hardest) is bigger and gold */
function TitlePill({
  title,
  main,
  onPress,
}: {
  title: Pick<EarnedTitle, "label" | "icon">;
  main: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="How you earned it"
      className={`flex-row items-center rounded-full border active:opacity-70 ${
        main ? "gap-1.5 px-3.5 py-2" : "gap-1 px-2.5 py-1.5 bg-zinc-900 border-zinc-800"
      }`}
      style={main ? {backgroundColor: "rgba(251,191,36,0.12)", borderColor: "rgba(251,191,36,0.45)"} : undefined}
    >
      <Ionicons name={title.icon} size={main ? 15 : 12} color={main ? TITLE_COLOR : "#a1a1aa"} />
      <Text
        className={main ? "text-sm font-extrabold" : "text-zinc-300 text-xs font-semibold"}
        style={main ? {color: TITLE_COLOR} : undefined}
        numberOfLines={1}
      >
        {title.label}
      </Text>
    </Pressable>
  );
}

/**
 * Titles earned from your finished dates (#84), up to three: the hardest
 * in the middle, the next on the left, the third on the right.
 */
function TitlesRow({titles, finished}: {titles: EarnedTitle[]; finished: number}) {
  const shown = titleLayout(titles);
  if (!shown.length) {
    // Not enough dates yet, or nothing in common yet
    const early = finished < DATES_FOR_TITLES;
    return (
      <View className="flex-row justify-center mt-4">
        <TitlePill
          title={{label: early ? "New to Venture" : "Still exploring", icon: early ? "sparkles" : "compass"}}
          main={false}
          onPress={() =>
            showInfo(
              early ? "Titles come from your dates" : "Still exploring",
              early
                ? `Finish ${DATES_FOR_TITLES - finished} more ${DATES_FOR_TITLES - finished === 1 ? "date" : "dates"} to start earning them.`
                : "Titles come from what your dates have in common. Keep going.",
            )
          }
        />
      </View>
    );
  }
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-2 mt-4">
      {shown.map(({title, main}) => (
        <TitlePill key={title.id} title={title} main={main} onPress={() => showInfo(title.label, title.because)} />
      ))}
    </View>
  );
}

/** Your handle, with your partner beside it (#35): one line, either side shrinks */
function HandleLine({username}: {username: string}) {
  const router = useRouter();
  const partner = useConnectionsStore((s) => s.connections.find((c) => c.is_partner) ?? null);
  return (
    <View className="flex-row items-center justify-center gap-2 mt-1 px-4 max-w-full">
      <Text className="text-zinc-400 font-medium text-sm shrink" numberOfLines={1}>
        @{username}
      </Text>
      {partner && (
        <>
          <Text className="text-zinc-600 text-sm">·</Text>
          <Pressable
            onPress={() => router.push("/connections")}
            accessibilityRole="button"
            accessibilityLabel={`With @${partner.username}. Open connections`}
            hitSlop={6}
            className="flex-row items-center gap-1 shrink active:opacity-70"
          >
            <Ionicons name="heart" size={12} color="#f472b6" />
            <Text className="text-pink-300 text-sm font-semibold shrink" numberOfLines={1}>
              with @{partner.username}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** Your connections, beside Edit profile (only you see the count). Opens Connections. */
function ConnectionsButton() {
  const router = useRouter();
  const connections = useConnectionsStore((s) => s.connections);
  const shown = connections.slice(0, 3);
  const waiting = useConnectionsStore((s) => s.incoming.length);

  return (
    <Pressable
      onPress={() => router.push("/connections")}
      accessibilityRole="button"
      accessibilityLabel={
        connections.length
          ? `${connections.length} connections${waiting ? `, ${waiting} waiting` : ""}`
          : "Add connections"
      }
      className="flex-1 flex-row items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-zinc-900 border border-zinc-800 active:opacity-80"
    >
      {shown.length > 0 ? (
        <View className="flex-row">
          {shown.map((c, i) => (
            <View key={c.user_id} style={{marginLeft: i === 0 ? 0 : -8}}>
              <Avatar profile={c} size={20} small />
            </View>
          ))}
        </View>
      ) : (
        <Ionicons name="person-add-outline" size={15} color="#d4d4d8" />
      )}
      <Text className="text-white font-bold text-sm shrink" numberOfLines={1}>
        {connections.length
          ? `${connections.length} connection${connections.length === 1 ? "" : "s"}`
          : "Add connections"}
      </Text>
      {waiting > 0 && (
        <View className="bg-blue-500 rounded-full min-w-5 h-5 px-1.5 items-center justify-center">
          <Text className="text-white text-xs font-extrabold">{badgeCount(waiting)}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const preferences = useProfileStore((s) => s.preferences);
  const status = useProfileStore((s) => s.status);
  const error = useProfileStore((s) => s.error);
  const reload = useProfileStore((s) => s.reload);

  const [activeTab, setActiveTab] = useState<Tab>("memories");
  const header = useTabHeader();
  const reloadDates = useItineraryStore((s) => s.reload);
  const savedItems = useSavedStore((s) => s.items);
  // Your partner's shared saves count too (#35)
  const partnerSaves = useSavedStore((s) => s.partnerItems.length);
  const toggleSaved = useSavedStore((s) => s.toggle);
  const reloadSaved = useSavedStore((s) => s.reload);
  const myIdeas = useMyIdeasStore((s) => s.ideas);
  const attentionCount = myIdeas.filter(
    (idea) => idea.visibility === "NEEDS_REVISION" || idea.visibility === "REJECTED",
  ).length;
  const reloadMyIdeas = useMyIdeasStore((s) => s.reload);
  // Coming back to Profile: your partner's newly shared saves (#35)
  useFocusEffect(
    useCallback(() => {
      reloadSaved();
    }, [reloadSaved]),
  );
  const refresh = useTabRefresh(() =>
    Promise.all([reload(), reloadDates(), reloadSaved(), reloadMyIdeas()]),
  );

  // Saved ideas you can still see, and ones unpublished or deleted since
  const savedIdeas = savedItems.flatMap((item) => (item.idea ? [item.idea] : []));
  const goneIds = savedItems
    .filter((item) => !item.idea)
    .map((item) => item.activity_id);

  const itineraries = useItineraryStore((s) => s.itineraries);
  const {active, upcoming, past} = useMemo(
    () => groupItineraries(itineraries),
    [itineraries],
  );
  const upNext = active ?? upcoming[0] ?? null;
  const finishedCount = itineraries.filter((i) => i.status === "COMPLETED").length;
  const titles = useMemo(
    () =>
      earnedTitles(
        itineraries,
        preferences && hasHomeArea(preferences)
          ? {latitude: preferences.home_lat as number, longitude: preferences.home_lng as number}
          : null,
      ),
    [itineraries, preferences],
  );

  if (!profile || !preferences) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#000",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        {status === "error" ? (
          <>
            <Text className="text-white font-bold text-lg text-center">
              {"Couldn't load your profile"}
            </Text>
            {error && (
              <Text className="text-zinc-400 text-center mt-2">{error}</Text>
            )}
            <Pressable
              onPress={reload}
              className="bg-white rounded-2xl px-6 py-3 mt-6 active:opacity-80"
            >
              <Text className="text-black font-bold">Try again</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color="white" />
        )}
      </SafeAreaView>
    );
  }

  const empty = EMPTY_STATES[activeTab];

  return (
    // The scroll view is the screen's root (see TabHeader.tsx for why)
    <Animated.ScrollView
      {...header.scrollProps}
      style={{flex: 1, backgroundColor: "#000"}}
      contentContainerStyle={{paddingBottom: 40}}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
    >
      <TabHeader
        header={header}
        title="Profile"
        refreshing={refresh.headerSpinner}
        right={
          <HeaderIconButton
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push("/settings")}
          />
        }
      />
      <View style={{paddingHorizontal: 20, paddingTop: 8}}>
        {/* --- IDENTITY --- */}
        <View className="items-center mb-6">
          <Pressable
            onPress={() => router.push("/settings/edit-profile")}
            accessibilityLabel="Edit profile photo"
          >
            <Avatar profile={profile} size={112} />
          </Pressable>

          <Text className="text-white font-bold text-2xl mt-4 tracking-tight">
            {displayName(profile)}
          </Text>
          {/* Your handle, and your partner beside it (#35) */}
          <HandleLine username={profile.username} />

          {/* TITLES earned from your dates (#84); planning defaults stay in Settings */}
          <TitlesRow titles={titles} finished={finishedCount} />
        </View>

        {/* --- ACTIONS: edit your profile, and your connections beside it --- */}
        <View className="flex-row gap-2 mb-8">
          <Pressable
            onPress={() => router.push("/settings/edit-profile")}
            accessibilityRole="button"
            className="flex-1 bg-white py-3 rounded-2xl items-center justify-center active:opacity-80"
          >
            <Text className="text-black font-bold text-sm">Edit profile</Text>
          </Pressable>
          <ConnectionsButton />
        </View>

        {/* --- UP NEXT --- */}
        <Text className="text-white font-bold text-lg mb-3 tracking-tight">
          Up Next
        </Text>
        {upNext ? (
          <View className="mb-8">
            <UpNextCard itinerary={upNext} />
          </View>
        ) : (
          <View className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 mb-8">
            <Text className="text-white font-bold text-base">
              Nothing planned yet
            </Text>
            <Text className="text-zinc-400 text-sm mt-1 mb-4">
              Your next date will show up here once you finalize it.
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/plan")}
              className="bg-zinc-800 rounded-2xl py-3 items-center flex-row justify-center gap-2 active:bg-zinc-700"
            >
              <Ionicons name="add-circle-outline" size={18} color="white" />
              <Text className="text-white font-bold">Plan a date</Text>
            </Pressable>
          </View>
        )}

        {/* --- PILL TABS --- */}
        <View className="flex-row bg-zinc-900 p-1 rounded-2xl border border-zinc-800 mb-6">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{selected: active}}
                className={`flex-1 py-2.5 rounded-xl items-center ${active ? "bg-zinc-800" : ""}`}
              >
                <View className="flex-row items-center gap-1.5">
                  <Text
                    className={`font-semibold text-sm ${active ? "text-white" : "text-zinc-500"}`}
                  >
                    {tab.label}
                  </Text>
                  {tab.key === "ideas" && attentionCount > 0 && (
                    <View
                      className="w-2 h-2 rounded-full"
                      style={{backgroundColor: ATTENTION_COLOR}}
                      accessibilityLabel={`${attentionCount} need your attention`}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* --- TAB CONTENT --- */}
        {activeTab === "ideas" && (
          <Pressable
            onPress={() => router.push("/create")}
            className="flex-row items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-2xl py-3.5 mb-4 active:opacity-70"
          >
            <Ionicons name="add" size={18} color="#d4d4d8" />
            <Text className="text-zinc-200 font-semibold">Share an idea</Text>
          </Pressable>
        )}

        {activeTab === "bucket" && goneIds.length > 0 && (
          <View className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 mb-4">
            <Text className="text-zinc-400 text-sm flex-1">
              {goneIds.length === 1
                ? "1 saved idea isn't available anymore."
                : `${goneIds.length} saved ideas aren't available anymore.`}
            </Text>
            <Pressable
              onPress={() => goneIds.forEach((id) => toggleSaved(id).catch(() => {}))}
              hitSlop={8}
            >
              <Text className="text-blue-400 font-semibold text-sm">Clear</Text>
            </Pressable>
          </View>
        )}

        {activeTab === "memories" && past.length > 0 ? (
          <MemoriesGrid dates={past} />
        ) : activeTab === "bucket" && (savedIdeas.length > 0 || partnerSaves > 0) ? (
          <SavedList />
        ) : activeTab === "ideas" && myIdeas.length > 0 ? (
          <View className="gap-6">
            {/* NEEDS YOUR ATTENTION: highlighted, grouped by verdict */}
            {attentionCount > 0 && (
              <View
                className="rounded-3xl p-3 gap-4 border"
                style={{
                  backgroundColor: "rgba(251,146,60,0.08)",
                  borderColor: "rgba(251,146,60,0.35)",
                }}
              >
                <View className="flex-row items-center gap-2 px-1 pt-1">
                  <Ionicons name="alert-circle" size={18} color={ATTENTION_COLOR} />
                  <Text className="font-bold text-base flex-1" style={{color: ATTENTION_COLOR}}>
                    Needs your attention
                  </Text>
                  <View
                    className="min-w-6 h-6 px-1.5 rounded-full items-center justify-center"
                    style={{backgroundColor: ATTENTION_COLOR}}
                  >
                    <Text className="text-black font-bold text-xs">{attentionCount}</Text>
                  </View>
                </View>
                {ATTENTION_GROUPS.map((group) => {
                  const ideas = myIdeas.filter((idea) => idea.visibility === group.status);
                  if (ideas.length === 0) return null;
                  return (
                    <View key={group.status} className="gap-2">
                      <Text className="text-zinc-300 text-xs font-bold uppercase tracking-wider px-1">
                        {group.title} · {ideas.length}
                      </Text>
                      {ideas.map((idea) => (
                        <MyIdeaRow
                          key={idea.idea_id}
                          idea={idea}
                          onMore={() => showIdeaActions(idea)}
                        />
                      ))}
                    </View>
                  );
                })}
              </View>
            )}

            {IDEA_SECTIONS.map((section) => {
              const ideas = myIdeas.filter((idea) => idea.visibility === section.status);
              if (ideas.length === 0) return null;
              return (
                <View key={section.title} className="gap-3">
                  <View className="flex-row items-baseline gap-2 px-1">
                    <Text className="text-white font-bold text-base">
                      {section.title}
                    </Text>
                    <Text className="text-zinc-500 font-semibold text-sm">
                      {ideas.length}
                    </Text>
                  </View>
                  {ideas.map((idea) => (
                    <MyIdeaRow
                      key={idea.idea_id}
                      idea={idea}
                      onMore={() => showIdeaActions(idea)}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        ) : (
          <View className="items-center py-10 px-6">
            <View className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center mb-4">
              <Ionicons name={empty.icon} size={24} color="#a1a1aa" />
            </View>
            <Text className="text-white font-bold text-base">
              {empty.title}
            </Text>
            <Text className="text-zinc-500 text-sm text-center mt-1">
              {empty.body}
            </Text>
            {activeTab === "bucket" && (
              <Pressable
                onPress={() => router.push("/(tabs)/explore")}
                className="bg-zinc-800 rounded-2xl px-5 py-3 mt-5 active:bg-zinc-700"
              >
                <Text className="text-white font-bold">Browse Discover</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Animated.ScrollView>
  );
}
