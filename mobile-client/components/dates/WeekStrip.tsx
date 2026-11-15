// components/dates/WeekStrip.tsx
// A horizontal run of days for the Activity tab. Days with a planned date get
// a dot; tapping a day filters the list to it (tap again to clear).

import React from "react";
import {View, Text, Pressable, ScrollView} from "react-native";
import * as Haptics from "expo-haptics";

import {toLocalDateString} from "@/src/lib/profile";

export type DayMark = "planned" | "live";

export function dayKey(value: string | Date): string {
  return toLocalDateString(new Date(value));
}

/** Today plus the next `count - 1` days, at local midnight. */
export function upcomingDays(count: number, now = new Date()): Date[] {
  return Array.from(
    {length: count},
    (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i),
  );
}

export default function WeekStrip({
  days,
  marks,
  selected,
  onSelect,
}: {
  days: Date[];
  marks: Record<string, DayMark>;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const todayKey = dayKey(new Date());

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="px-5 gap-2"
    >
      {days.map((day) => {
        const key = dayKey(day);
        const isSelected = key === selected;
        const isToday = key === todayKey;
        const mark = marks[key];
        const weekday = day.toLocaleDateString([], {weekday: "short"});

        return (
          <Pressable
            key={key}
            onPress={() => {
              if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
              onSelect(isSelected ? null : key);
            }}
            accessibilityRole="button"
            accessibilityLabel={day.toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            accessibilityState={{selected: isSelected}}
            className={`w-[52px] py-3 rounded-2xl items-center border ${
              isSelected
                ? "bg-white border-white"
                : isToday
                  ? "bg-zinc-900 border-blue-500/60"
                  : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <Text
              className={`text-[11px] font-bold uppercase ${
                isSelected
                  ? "text-zinc-500"
                  : isToday
                    ? "text-blue-400"
                    : "text-zinc-500"
              }`}
            >
              {isToday ? "Today" : weekday}
            </Text>
            <Text
              className={`text-xl font-extrabold mt-0.5 ${
                isSelected ? "text-black" : "text-white"
              }`}
            >
              {day.getDate()}
            </Text>
            <View
              className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                !mark
                  ? "bg-transparent"
                  : mark === "live"
                    ? "bg-[#FF9D0A]"
                    : isSelected
                      ? "bg-blue-600"
                      : "bg-blue-400"
              }`}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
