// components/places/HoursEditor.tsx
// Opening hours for a new place (#6): "Not sure" (the default; never
// flagged closed), "24 hours", "Daylight" (sunrise to sunset: trails,
// lookouts), or "Set hours": a simple week, each day open or closed with a
// from and to time. Saved in OpenStreetMap's format (utils/openingHours.ts
// hoursText), so the idea page's "Open now", the builder's "Closed then"
// and the live date's warnings all work for it.

import React from "react";
import {Pressable, Switch, Text, View} from "react-native";
import DateTimePicker, {DateTimePickerAndroid} from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import {DAYLIGHT, type DayHours, hoursText} from "@/utils/openingHours";

export type HoursMode = "unknown" | "always" | "daylight" | "set";
export type HoursChoice = {mode: HoursMode; week: DayHours[]};

/** A usual week to start from: every day 9 AM to 5 PM */
export const DEFAULT_HOURS: HoursChoice = {
  mode: "unknown",
  week: Array.from({length: 7}, () => ({open: true, from: 9 * 60, to: 17 * 60})),
};

/** The hours to save (null: not sure) */
export function hoursFromChoice(choice: HoursChoice): string | null {
  switch (choice.mode) {
    case "always":
      return "24/7";
    case "daylight":
      return DAYLIGHT;
    case "set":
      return choice.week.some((d) => d.open) ? hoursText(choice.week) : null;
    default:
      return null;
  }
}

const MODES: {mode: HoursMode; label: string}[] = [
  {mode: "unknown", label: "Not sure"},
  {mode: "always", label: "24 hours"},
  {mode: "daylight", label: "Daylight"},
  {mode: "set", label: "Set hours"},
];

const MODE_NOTE: Record<HoursMode, string> = {
  unknown: "That's fine: it's never marked closed.",
  always: "Open any time, day or night.",
  daylight: "Open from sunrise to sunset (worked out for the place, every day).",
  set: "Days and times it's open.",
};

/** A known Monday (Jan 3 2000) + i, so the names are in the phone's language */
const dayName = (i: number) => new Date(2000, 0, 3 + i).toLocaleDateString([], {weekday: "short"});
const asDate = (minutes: number) => new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
const asMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
const clock = (minutes: number) => asDate(minutes).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});

/** A time: iOS's compact picker, or a button that opens Android's clock */
function TimeField({minutes, onChange, label}: {minutes: number; onChange: (m: number) => void; label: string}) {
  if (process.env.EXPO_OS === "ios") {
    return (
      <DateTimePicker
        value={asDate(minutes)}
        mode="time"
        display="compact"
        minuteInterval={15}
        themeVariant="dark"
        accessibilityLabel={label}
        onValueChange={(_e, date) => date && onChange(asMinutes(date))}
      />
    );
  }
  return (
    <Pressable
      onPress={() =>
        DateTimePickerAndroid.open({
          value: asDate(minutes),
          mode: "time",
          minuteInterval: 15,
          onValueChange: (_e, date) => date && onChange(asMinutes(date)),
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${clock(minutes)}`}
      className="bg-zinc-800 rounded-lg px-3 py-1.5 active:opacity-70"
    >
      <Text className="text-white text-sm">{clock(minutes)}</Text>
    </Pressable>
  );
}

export default function HoursEditor({
  value,
  onChange,
}: {
  value: HoursChoice;
  onChange: (next: HoursChoice) => void;
}) {
  const tap = () => {
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
  };
  const setDay = (i: number, patch: Partial<DayHours>) =>
    onChange({...value, week: value.week.map((d, j) => (j === i ? {...d, ...patch} : d))});
  const copyMonday = () => {
    tap();
    onChange({...value, week: value.week.map(() => ({...value.week[0]}))});
  };

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        {MODES.map(({mode, label}) => {
          const on = value.mode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => {
                tap();
                onChange({...value, mode});
              }}
              accessibilityRole="button"
              accessibilityState={{selected: on}}
              className={`flex-1 h-10 rounded-xl border items-center justify-center active:opacity-70 ${
                on ? "bg-zinc-800 border-white" : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <Text className={`text-sm font-bold ${on ? "text-white" : "text-zinc-500"}`} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-zinc-500 text-xs ml-1">{MODE_NOTE[value.mode]}</Text>

      {value.mode === "set" && (
        <View className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-1">
          {value.week.map((day, i) => (
            <View
              key={i}
              className={`flex-row items-center gap-3 py-2.5 ${i < 6 ? "border-b border-zinc-800" : ""}`}
            >
              <Text className="text-white font-semibold text-sm w-10">{dayName(i)}</Text>
              <Switch
                value={day.open}
                onValueChange={(open) => {
                  tap();
                  setDay(i, {open});
                }}
                accessibilityLabel={`${dayName(i)} open`}
                style={{transform: [{scale: 0.8}]}}
              />
              {day.open ? (
                <View className="flex-1 flex-row items-center justify-end gap-1.5">
                  <TimeField minutes={day.from} label={`${dayName(i)} opens`} onChange={(from) => setDay(i, {from})} />
                  <Text className="text-zinc-500 text-sm">to</Text>
                  <TimeField minutes={day.to} label={`${dayName(i)} closes`} onChange={(to) => setDay(i, {to})} />
                </View>
              ) : (
                <Text className="flex-1 text-right text-zinc-500 text-sm">Closed</Text>
              )}
            </View>
          ))}
          <Pressable
            onPress={copyMonday}
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-1.5 py-3 border-t border-zinc-800 active:opacity-70"
          >
            <Ionicons name="copy-outline" size={14} color="#60a5fa" />
            <Text className="text-blue-400 text-sm font-semibold">Use {dayName(0)}&apos;s hours every day</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
