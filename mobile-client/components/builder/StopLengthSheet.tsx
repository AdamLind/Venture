// components/builder/StopLengthSheet.tsx
// "How long?" for a placed stop: tap a stop in the builder to spend longer
// (or less time) there than the idea suggests. Longer is free; shorter is
// allowed, with a warning (red for fixed-length ideas like a movie or a
// class, orange for flexible ones), matching the plan evaluator's rule.
//
// The backdrop fades while the sheet slides (the Modal's own "slide" moved
// both), and the note above the − / + buttons always keeps its space, so a
// warning appearing never moves the buttons under your finger.

import React, {useEffect, useState} from "react";
import {Animated, Modal, Pressable, StyleSheet, Text, View} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {formatMinutes} from "@/components/builder/BuilderParts";

const STEP = 15;
const MIN = 15;
const MAX = 12 * 60;
const OPEN_MS = 260;
const CLOSE_MS = 200;

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});

type Stop = {
  title: string;
  startMs: number;
  minutes: number;
  suggested: number;
  /** A fixed-length idea (is_duration_variable = false) */
  fixed: boolean;
  /**
   * Minutes the date can grow before it runs past its end time, at this
   * stop's current length (null: open-ended). Everything after the stop
   * shifts by the same amount, so this is exact.
   */
  roomMinutes: number | null;
  /** "10:00 PM" */
  endLabel: string;
};

export default function StopLengthSheet({
  stop,
  onDone,
  onClose,
}: {
  /** The stop being edited, or null when the sheet is closed */
  stop: Stop | null;
  onDone: (minutes: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!stop} transparent animationType="none" onRequestClose={onClose}>
      {/* Remount per stop, so the picker starts at that stop's length */}
      {stop && (
        <Sheet key={`${stop.title}-${stop.startMs}`} stop={stop} onDone={onDone} onClose={onClose} />
      )}
    </Modal>
  );
}

function Sheet({
  stop,
  onDone,
  onClose,
}: {
  stop: Stop;
  onDone: (minutes: number) => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(stop.minutes);
  const [progress] = useState(() => new Animated.Value(0));
  const [sheetHeight, setSheetHeight] = useState(420);
  const shorter = minutes < stop.suggested;

  useEffect(() => {
    Animated.timing(progress, {toValue: 1, duration: OPEN_MS, useNativeDriver: true}).start();
  }, [progress]);

  // Slide away and fade out, then tell the builder
  const leave = (then: () => void) =>
    Animated.timing(progress, {toValue: 0, duration: CLOSE_MS, useNativeDriver: true}).start(then);

  const set = (value: number) => {
    const next = Math.max(MIN, Math.min(MAX, value));
    if (next !== minutes && process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    setMinutes(next);
  };

  const presets = [
    {label: `Suggested · ${formatMinutes(stop.suggested)}`, value: stop.suggested},
    {label: "+30 min", value: stop.suggested + 30},
    {label: "+1 hour", value: stop.suggested + 60},
  ];

  // How far past the end time this length would push the date (0 if it fits)
  const overBy =
    stop.roomMinutes == null ? 0 : Math.max(0, minutes - stop.minutes - stop.roomMinutes);
  const roomLeft =
    stop.roomMinutes == null ? null : Math.max(0, stop.roomMinutes - (minutes - stop.minutes));
  const tone = overBy > 0 ? "over" : shorter ? (stop.fixed ? "fixed" : "flexible") : "neutral";

  return (
    <View className="flex-1 justify-end">
      {/* Backdrop: fades (classes on the plain view inside; NativeWind doesn't
          reliably style Animated views) */}
      <Animated.View style={[StyleSheet.absoluteFill, {opacity: progress}]}>
        <Pressable
          className="flex-1 bg-black/60"
          onPress={() => leave(onClose)}
          accessibilityLabel="Close"
        />
      </Animated.View>

      {/* Sheet: slides */}
      <Animated.View
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        style={{
          transform: [
            {translateY: progress.interpolate({inputRange: [0, 1], outputRange: [sheetHeight, 0]})},
          ],
        }}
      >
        <View className="bg-zinc-950 border-t border-zinc-800 p-6 pb-12 rounded-t-3xl gap-5">
          <View className="flex-row justify-between items-center">
            <Pressable onPress={() => leave(onClose)} hitSlop={10}>
              <Text className="text-zinc-400 font-semibold text-base">Cancel</Text>
            </Pressable>
            <Text className="text-white font-bold text-lg">How long?</Text>
            <Pressable onPress={() => leave(() => onDone(minutes))} hitSlop={10}>
              <Text className="text-white font-bold text-base">Done</Text>
            </Pressable>
          </View>

          <Text className="text-zinc-400 text-center" numberOfLines={1}>
            {stop.title}
          </Text>

          {/* The note: always here (same space), so nothing below it moves */}
          <View
            className={`min-h-16 flex-row items-center gap-2.5 rounded-2xl px-4 py-3 border ${
              tone === "fixed"
                ? "bg-red-500/10 border-red-500/30"
                : tone === "flexible" || tone === "over"
                  ? "bg-orange-500/10 border-orange-500/30"
                  : "bg-zinc-900 border-zinc-800"
            }`}
          >
            <Ionicons
              name={tone === "neutral" ? "time-outline" : tone === "over" ? "flag-outline" : "alert-circle-outline"}
              size={18}
              color={
                tone === "fixed" ? "#f87171" : tone === "flexible" || tone === "over" ? "#fb923c" : "#a1a1aa"
              }
            />
            <Text
              className={`flex-1 text-sm ${
                tone === "fixed"
                  ? "text-red-300"
                  : tone === "flexible" || tone === "over"
                    ? "text-orange-200"
                    : "text-zinc-400"
              }`}
              numberOfLines={2}
            >
              {tone === "over"
                ? `Runs ${formatMinutes(overBy)} past ${stop.endLabel}. You can extend the date to fit.`
                : tone === "fixed"
                ? `This usually takes ${formatMinutes(stop.suggested)}. Cutting it short may not work out on the day.`
                : tone === "flexible"
                  ? `Shorter than suggested (${formatMinutes(stop.suggested)}). You might feel rushed.`
                  : roomLeft == null
                    ? `Suggested: ${formatMinutes(stop.suggested)}. Staying longer is always fine.`
                    : roomLeft === 0
                      ? `Suggested: ${formatMinutes(stop.suggested)}. No room left before ${stop.endLabel}.`
                      : `Suggested: ${formatMinutes(stop.suggested)}. Room for ${formatMinutes(roomLeft)} more before ${stop.endLabel}.`}
            </Text>
          </View>

          {/* − 2h 30m + */}
          <View className="flex-row items-center justify-center gap-6">
            <Pressable
              onPress={() => set(minutes - STEP)}
              disabled={minutes <= MIN}
              accessibilityRole="button"
              accessibilityLabel="15 minutes shorter"
              className="w-14 h-14 rounded-full bg-zinc-800 items-center justify-center active:opacity-70"
            >
              <Ionicons name="remove" size={24} color={minutes <= MIN ? "#52525b" : "white"} />
            </Pressable>
            <View className="items-center" style={{minWidth: 130}}>
              <Text className="text-white font-extrabold text-4xl">{formatMinutes(minutes)}</Text>
              <Text className="text-zinc-500 text-sm mt-1">
                {clock(stop.startMs)} – {clock(stop.startMs + minutes * 60_000)}
              </Text>
            </View>
            <Pressable
              onPress={() => set(minutes + STEP)}
              disabled={minutes >= MAX}
              accessibilityRole="button"
              accessibilityLabel="15 minutes longer"
              className="w-14 h-14 rounded-full bg-zinc-800 items-center justify-center active:opacity-70"
            >
              <Ionicons name="add" size={24} color={minutes >= MAX ? "#52525b" : "white"} />
            </Pressable>
          </View>

          <View className="flex-row flex-wrap justify-center gap-2">
            {presets.map((preset) => {
              const active = preset.value === minutes;
              // Would this one push the date past its end time?
              const runsOver =
                stop.roomMinutes != null && preset.value - stop.minutes > stop.roomMinutes;
              return (
                <Pressable
                  key={preset.label}
                  onPress={() => set(preset.value)}
                  accessibilityHint={runsOver ? `Runs past ${stop.endLabel}` : undefined}
                  className={`px-4 py-2 rounded-xl border active:opacity-70 ${
                    active
                      ? "bg-zinc-800 border-white"
                      : runsOver
                        ? "bg-orange-500/10 border-orange-500/30"
                        : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <Text
                    className={`font-bold ${
                      runsOver ? "text-orange-200" : active ? "text-white" : "text-zinc-500"
                    }`}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
