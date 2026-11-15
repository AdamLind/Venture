import React, {useMemo, useState} from "react";
import {View, Text, Pressable, ActivityIndicator, Animated} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";

import Avatar from "@/components/profile/Avatar";
import TabHeader, {
  HeaderIconButton,
  useTabHeader,
  useTabRefresh,
} from "@/components/ui/TabHeader";
import {useProfileStore} from "@/src/store/useProfileStore";
import {budgetLabel, displayName, hasHomeArea} from "@/src/lib/profile";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {groupItineraries} from "@/src/lib/dates";
import {PastDateCard, UpNextCard} from "@/components/dates/DateCards";

type Tab = "past" | "bucket" | "ideas";
type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: {key: Tab; label: string}[] = [
  {key: "past", label: "Past Dates"},
  {key: "bucket", label: "Bucket List"},
  {key: "ideas", label: "My Ideas"},
];

// Bucket List and My Ideas are filled in by Phase 3
const EMPTY_STATES: Record<Tab, {icon: IconName; title: string; body: string}> =
  {
    past: {
      icon: "time-outline",
      title: "No past dates yet",
      body: "Dates you finish will show up here.",
    },
    bucket: {
      icon: "bookmark-outline",
      title: "Your bucket list is empty",
      body: "Ideas you save while exploring will show up here.",
    },
    ideas: {
      icon: "bulb-outline",
      title: "No ideas shared yet",
      body: "Ideas you submit, and where they are in review, will show up here.",
    },
  };

function Chip({icon, label}: {icon: IconName; label: string}) {
  return (
    <View className="bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800 flex-row items-center gap-1.5">
      <Ionicons name={icon} size={12} color="#a1a1aa" />
      <Text className="text-zinc-300 text-xs font-semibold" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const preferences = useProfileStore((s) => s.preferences);
  const status = useProfileStore((s) => s.status);
  const error = useProfileStore((s) => s.error);
  const reload = useProfileStore((s) => s.reload);

  const [activeTab, setActiveTab] = useState<Tab>("past");
  const header = useTabHeader();
  const reloadDates = useItineraryStore((s) => s.reload);
  const refresh = useTabRefresh(() => Promise.all([reload(), reloadDates()]));

  const itineraries = useItineraryStore((s) => s.itineraries);
  const {active, upcoming, past} = useMemo(
    () => groupItineraries(itineraries),
    [itineraries],
  );
  const upNext = active ?? upcoming[0] ?? null;

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

  const goToPlanningDefaults = () => router.push("/settings/planning");
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
          <Text className="text-zinc-400 font-medium text-sm mt-1">
            @{profile.username}
          </Text>

          {/* Planning style, from saved defaults (only visible to you) */}
          <Pressable
            onPress={goToPlanningDefaults}
            accessibilityLabel="Edit planning defaults"
            className="flex-row flex-wrap justify-center gap-2 mt-4"
          >
            <Chip
              icon="wallet-outline"
              label={budgetLabel(preferences.default_budget)}
            />
            <Chip
              icon={
                preferences.default_modality === "GO_OUT"
                  ? "walk-outline"
                  : "home-outline"
              }
              label={
                preferences.default_modality === "GO_OUT" ? "Go Out" : "Stay In"
              }
            />
            <Chip
              icon="navigate-outline"
              label={`${preferences.default_travel_miles} mi`}
            />
            {hasHomeArea(preferences) && preferences.home_label && (
              <Chip icon="location-outline" label={preferences.home_label} />
            )}
          </Pressable>
        </View>

        {/* --- ACTIONS --- */}
        <Pressable
          onPress={() => router.push("/settings/edit-profile")}
          className="bg-white py-3 rounded-2xl items-center active:opacity-80 mb-8"
        >
          <Text className="text-black font-bold text-sm">Edit Profile</Text>
        </Pressable>

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
                <Text
                  className={`font-semibold text-sm ${active ? "text-white" : "text-zinc-500"}`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* --- TAB CONTENT --- */}
        {activeTab === "past" && past.length > 0 ? (
          <View className="gap-4">
            {past.map((itinerary) => (
              <PastDateCard key={itinerary.itinerary_id} itinerary={itinerary} />
            ))}
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
          </View>
        )}
      </View>
    </Animated.ScrollView>
  );
}
