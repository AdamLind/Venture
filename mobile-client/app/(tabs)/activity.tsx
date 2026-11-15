import React, {useMemo, useState} from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import {router} from "expo-router";

import type {Itinerary} from "@/types/dates";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {countdownLabel, groupItineraries} from "@/src/lib/dates";
import {parseLocalDate} from "@/src/lib/profile";
import {LiveDateCard, UpcomingDateCard} from "@/components/dates/DateCards";
import TabHeader, {
  HeaderIconButton,
  useTabHeader,
  useTabRefresh,
} from "@/components/ui/TabHeader";
import WeekStrip, {
  dayKey,
  upcomingDays,
  type DayMark,
} from "@/components/dates/WeekStrip";

/** How many days the strip shows, starting today. */
const STRIP_DAYS = 21;

const DAY_MS = 86_400_000;

function daysFromToday(value: string, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((parseLocalDate(dayKey(value)).getTime() - today.getTime()) / DAY_MS);
}

/** Splits upcoming dates into "This week" / "Next week" / "Later". */
function bucketByWeek(dates: Itinerary[]) {
  const buckets: {title: string; items: Itinerary[]}[] = [
    {title: "This week", items: []},
    {title: "Next week", items: []},
    {title: "Later", items: []},
  ];
  for (const date of dates) {
    const days = daysFromToday(date.starts_at);
    buckets[days < 7 ? 0 : days < 14 ? 1 : 2].items.push(date);
  }
  return buckets.filter((b) => b.items.length > 0);
}

const planFor = (key?: string) =>
  router.push({pathname: "/(tabs)/plan", params: key ? {startsOn: key} : {}});

export default function Activity() {
  const itineraries = useItineraryStore((s) => s.itineraries);
  const status = useItineraryStore((s) => s.status);
  const error = useItineraryStore((s) => s.error);
  const reload = useItineraryStore((s) => s.reload);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const header = useTabHeader({subtitle: true});
  const refresh = useTabRefresh(reload);

  const {active, upcoming, past} = useMemo(
    () => groupItineraries(itineraries),
    [itineraries],
  );

  // Rebuilt with the itineraries so the strip rolls over after midnight on refresh
  const days = useMemo(() => upcomingDays(STRIP_DAYS), [itineraries]); // eslint-disable-line react-hooks/exhaustive-deps

  const marks = useMemo(() => {
    const result: Record<string, DayMark> = {};
    for (const date of upcoming) result[dayKey(date.starts_at)] = "planned";
    if (active) result[dayKey(active.starts_at)] = "live";
    return result;
  }, [upcoming, active]);

  const firstLoad = status === "loading" && itineraries.length === 0;
  const hasAnything = !!active || upcoming.length > 0;

  const selectedDate = selectedDay ? parseLocalDate(selectedDay) : null;
  const onSelectedDay = selectedDay
    ? upcoming.filter((d) => dayKey(d.starts_at) === selectedDay)
    : [];
  const sections = bucketByWeek(upcoming);

  const monthLabel = (selectedDate ?? new Date()).toLocaleDateString([], {
    month: "long",
    year:
      (selectedDate ?? new Date()).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });

  const subtitle = active
    ? "You're out right now"
    : upcoming.length > 0
      ? `${upcoming.length} planned · next one ${countdownLabel(upcoming[0].starts_at).toLowerCase()}`
      : "Nothing on the books yet";

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
        title="Upcoming"
        subtitle={subtitle}
        refreshing={refresh.headerSpinner}
        right={
          <HeaderIconButton
            icon="add"
            label="Plan a date"
            onPress={() => planFor()}
          />
        }
      />
      <View style={{paddingTop: 8}}>

        {/* --- WEEK STRIP --- */}
        <View className="flex-row items-center justify-between px-5 mb-3">
          <Text className="text-white font-bold text-lg tracking-tight">
            {monthLabel}
          </Text>
          {selectedDay && (
            <Pressable onPress={() => setSelectedDay(null)} hitSlop={8}>
              <Text className="text-blue-400 font-semibold">Show all</Text>
            </Pressable>
          )}
        </View>
        <WeekStrip
          days={days}
          marks={marks}
          selected={selectedDay}
          onSelect={setSelectedDay}
        />

        <View className="px-5 pt-7">
          {firstLoad && (
            <View className="py-16 items-center">
              <ActivityIndicator color="white" />
            </View>
          )}

          {status === "error" && (
            <View className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6">
              <Text className="text-red-300 font-bold">
                {"Couldn't load your dates"}
              </Text>
              {error && <Text className="text-red-200/70 mt-1">{error}</Text>}
              <Text className="text-red-200/70 mt-1">
                Pull down to try again.
              </Text>
            </View>
          )}

          {/* --- LIVE NOW (only during a date) --- */}
          {active && !selectedDay && (
            <View className="mb-8">
              <View className="flex-row items-center gap-2 mb-3 px-1">
                <View className="w-2.5 h-2.5 bg-[#FF9D0A] rounded-full" />
                <Text className="text-[#FF9D0A] font-bold text-sm uppercase tracking-widest">
                  Live Now
                </Text>
              </View>
              <LiveDateCard itinerary={active} />
            </View>
          )}

          {/* --- ONE DAY (a day is selected in the strip) --- */}
          {!firstLoad && selectedDate && (
            <>
              <SectionTitle
                title={selectedDate.toLocaleDateString([], {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
                count={onSelectedDay.length}
              />
              {onSelectedDay.length > 0 ? (
                <View className="gap-5">
                  {onSelectedDay.map((itinerary) => (
                    <UpcomingDateCard
                      key={itinerary.itinerary_id}
                      itinerary={itinerary}
                    />
                  ))}
                  <PlanThisDay dayKey={selectedDay!} compact />
                </View>
              ) : (
                <PlanThisDay dayKey={selectedDay!} />
              )}
            </>
          )}

          {/* --- ALL PLANNED, BY WEEK --- */}
          {!firstLoad && !selectedDay && (
            <View className="gap-8">
              {sections.map((section) => (
                <View key={section.title}>
                  <SectionTitle
                    title={section.title}
                    count={section.items.length}
                  />
                  <View className="gap-5">
                    {section.items.map((itinerary) => (
                      <UpcomingDateCard
                        key={itinerary.itinerary_id}
                        itinerary={itinerary}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* --- EMPTY STATE --- */}
          {!firstLoad && status !== "error" && !hasAnything && !selectedDay && (
            <View className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 items-center">
              <View className="w-14 h-14 rounded-full bg-blue-500/15 items-center justify-center mb-4">
                <Ionicons name="calendar" size={24} color="#60a5fa" />
              </View>
              <Text className="text-white font-bold text-lg">
                Nothing planned yet
              </Text>
              <Text className="text-zinc-500 text-center mt-1 mb-5">
                Pick a day above, or start a plan and it&apos;ll land here once
                you finalize it.
              </Text>
              <Pressable
                onPress={() => planFor()}
                className="bg-white rounded-2xl px-6 py-3 active:opacity-80"
              >
                <Text className="text-black font-bold">Plan a date</Text>
              </Pressable>
            </View>
          )}

          {/* --- PAST DATES LINK --- */}
          {!firstLoad && !selectedDay && past.length > 0 && (
            <Pressable
              onPress={() => router.push("/(tabs)/profile")}
              className="flex-row items-center bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 mt-8 active:opacity-70"
            >
              <Ionicons name="time-outline" size={18} color="#a1a1aa" />
              <Text className="text-zinc-300 font-semibold flex-1 ml-3">
                {past.length} past {past.length === 1 ? "date" : "dates"}
              </Text>
              <Text className="text-zinc-500 text-sm mr-1">On your profile</Text>
              <Ionicons name="chevron-forward" size={16} color="#71717a" />
            </Pressable>
          )}
        </View>
      </View>
    </Animated.ScrollView>
  );
}

function SectionTitle({title, count}: {title: string; count: number}) {
  return (
    <View className="flex-row items-baseline gap-2 mb-4 px-1">
      <Text className="text-white font-bold text-xl tracking-tight">
        {title}
      </Text>
      {count > 0 && (
        <Text className="text-zinc-500 font-semibold">{count}</Text>
      )}
    </View>
  );
}

/** "Nothing on Thursday" card (or a slim "Add another" row under existing dates). */
function PlanThisDay({dayKey: key, compact}: {dayKey: string; compact?: boolean}) {
  const weekday = parseLocalDate(key).toLocaleDateString([], {weekday: "long"});

  if (compact) {
    return (
      <Pressable
        onPress={() => planFor(key)}
        className="flex-row items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-2xl py-3.5 active:opacity-70"
      >
        <Ionicons name="add" size={18} color="#a1a1aa" />
        <Text className="text-zinc-300 font-semibold">
          Plan something else on {weekday}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => planFor(key)}
      className="border border-dashed border-blue-500/40 bg-blue-500/5 rounded-3xl p-6 items-center active:opacity-80"
    >
      <View className="w-12 h-12 rounded-full bg-blue-500/15 items-center justify-center mb-3">
        <Ionicons name="add" size={24} color="#60a5fa" />
      </View>
      <Text className="text-white font-bold text-base">
        {`Nothing on ${weekday} yet`}
      </Text>
      <Text className="text-blue-200/60 text-sm mt-1">
        Tap to start a plan for this day
      </Text>
    </Pressable>
  );
}
