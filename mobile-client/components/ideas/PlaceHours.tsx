// components/ideas/PlaceHours.tsx
// A place's opening hours (#8), as the first row of the idea page's details
// card: open or closed right now, tap for the week, and a reminder that
// hours change. Nothing when the hours aren't known. Hours from OpenStreetMap (#5) credit it, as its
// licence asks ("© OpenStreetMap contributors", linked).

import React, {useState} from "react";
import {Linking, Pressable, Text, View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Reanimated, {Easing, useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";

import {openNow, weekLines} from "@/utils/openingHours";

const GREEN = "#4ade80";
/** Opening / closing the week */
const EXPAND_MS = 260;
const ORANGE = "#fb923c";
const OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright";

export default function PlaceHours({
  hours,
  checkedAt,
  source,
  at,
  className = "",
}: {
  hours: string | null | undefined;
  /** venues.hours_checked_at */
  checkedAt?: string | null;
  /** venues.hours_source: "osm" credits OpenStreetMap */
  source?: string | null;
  /** The place (for daylight-only hours) */
  at?: {latitude: number; longitude: number} | null;
  /** Spacing around it (it renders nothing when the hours aren't known) */
  className?: string;
}) {
  // When the page opened (good enough while you read it)
  const [now] = useState(() => Date.now());
  const [showWeek, setShowWeek] = useState(false);
  // The week opens like a drawer: its space grows from 0 to its full height
  // (clipped), so the details below slide down with it instead of the rows
  // fading in over them. Its full height is measured while it's laid out
  // off to the side (absolute) inside the clipped space.
  const [weekHeight, setWeekHeight] = useState(0);
  const progress = useSharedValue(0);
  const weekStyle = useAnimatedStyle(() => ({height: weekHeight * progress.get()}));
  const status = openNow(hours, now, at);
  const week = weekLines(hours, now);
  if (!status || !week) return null;

  const color = status.open && !status.soon ? GREEN : ORANGE;
  const checked = checkedAt
    ? new Date(checkedAt).toLocaleDateString([], {month: "short", day: "numeric", year: "numeric"})
    : null;

  const toggle = () => {
    const next = !showWeek;
    setShowWeek(next);
    progress.set(withTiming(next ? 1 : 0, {duration: EXPAND_MS, easing: Easing.inOut(Easing.cubic)}));
  };

  // A row of the idea's details card, styled like its other stats (label
  // over value), full width
  return (
    <View className={className}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`Hours: ${status.label}. ${showWeek ? "Hide" : "Show"} the week's hours`}
        className="active:opacity-70"
      >
        <View className="flex-row items-center gap-2 mb-1">
          <Ionicons name="storefront-outline" size={18} color="#FF9D0A" />
          <Text className="text-zinc-400 text-xs font-bold">HOURS</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 font-bold text-lg" style={{color}}>
            {status.label}
          </Text>
          <Ionicons name={showWeek ? "chevron-up" : "chevron-down"} size={18} color="#71717a" />
        </View>
      </Pressable>

      {/* (inline: NativeWind doesn't reliably style Animated views) */}
      <Reanimated.View
        style={[{overflow: "hidden"}, weekStyle]}
        accessibilityElementsHidden={!showWeek}
        importantForAccessibility={showWeek ? "auto" : "no-hide-descendants"}
      >
        <View
          className="pt-3 gap-2"
          style={{position: "absolute", top: 0, left: 0, right: 0}}
          onLayout={(e) => setWeekHeight(e.nativeEvent.layout.height)}
        >
          {week.map((line) => (
            <View key={line.day} className="flex-row">
              <Text className={`w-14 text-sm ${line.today ? "text-white font-bold" : "text-zinc-400"}`}>
                {line.day}
              </Text>
              <Text className={`flex-1 text-sm ${line.today ? "text-white font-bold" : "text-zinc-400"}`}>
                {line.text}
              </Text>
            </View>
          ))}
        </View>
      </Reanimated.View>

      <Text className="mt-2 text-zinc-500 text-xs">
        Hours can change. Check before you go.{checked ? ` Last checked ${checked}.` : ""}
      </Text>
      {source === "osm" && (
        <Pressable
          onPress={() => Linking.openURL(OSM_COPYRIGHT).catch(() => {})}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel="Hours from OpenStreetMap contributors. Opens the OpenStreetMap copyright page"
          className="mt-1 self-start active:opacity-70"
        >
          <Text className="text-zinc-500 text-xs">
            Hours: <Text className="underline">© OpenStreetMap contributors</Text>
          </Text>
        </Pressable>
      )}
    </View>
  );
}
