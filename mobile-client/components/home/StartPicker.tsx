// components/home/StartPicker.tsx
// When the date starts, without a spinner and without scrolling: a strip of
// days (the calendar at its end for further out), then a row of likely times
// for the day you pick, with "Other" always last (a time picker in 15s; it
// shows the time you picked there). The common cases are one tap each
// (Saturday, 7:00). Every start is on the quarter hour and never in the past.
import * as Haptics from "expo-haptics";
import {useEffect, useState} from "react";
import {Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {Ionicons} from "@expo/vector-icons";

const MINUTE = 60_000;
const QUARTER = 15 * MINUTE;
const HALF_HOUR = 30 * MINUTE;
/** Days in the strip: today and the next five (the calendar for the rest) */
const DAYS_SHOWN = 6;
/** Likely starts, in hours: weekday evenings after work; weekends, the day too */
const LIKELY_WEEKDAY = [18, 19, 20];
const LIKELY_WEEKEND = [11, 14, 19];
/** Times before "Other" (today: "Now" and two) */
const TIME_SLOTS = 3;
/** Today's first time after "Now" is at least this much later */
const AFTER_NOW = 15 * MINUTE;
/** The latest time offered, in minutes after midnight (11:30 PM) */
const LATEST = 23 * 60 + 30;

/** The next quarter hour (on one already: itself) */
export const nextQuarter = (date: Date): Date => new Date(Math.ceil(date.getTime() / QUARTER) * QUARTER);

const dayStart = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const sameDay = (a: Date, b: Date) => dayStart(a).getTime() === dayStart(b).getTime();
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
/** "7:00 PM", "12:30 PM" */
const timeLabel = (date: Date) => date.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
/** `day` at `time`'s hours and minutes */
const at = (day: Date, time: Date): Date => {
  const d = new Date(day);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
};
const atHour = (day: Date, hour: number): Date => {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const tap = () => {
  if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

/**
 * The likely times for `day`, before "Other". Another day: three (evenings
 * on weekdays; on weekends, late morning, afternoon and evening). Today,
 * after "Now": the next two of those still ahead, or the next half hours
 * once they've gone (never past 11:30 PM).
 */
export function timesFor(day: Date, now: Date): Date[] {
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const likely = (weekend ? LIKELY_WEEKEND : LIKELY_WEEKDAY).map((h) => atHour(day, h));
  if (!sameDay(day, now)) return likely.slice(0, TIME_SLOTS);
  const earliest = nextQuarter(now).getTime() + AFTER_NOW;
  const list = likely.filter((d) => d.getTime() >= earliest);
  const first = Math.ceil(earliest / HALF_HOUR) * HALF_HOUR;
  for (let i = 0; list.length < TIME_SLOTS - 1; i++) {
    const d = new Date(first + i * HALF_HOUR);
    if (!sameDay(d, day) || minutesOf(d) > LATEST) break;
    if (!list.some((t) => t.getTime() === d.getTime())) list.push(d);
  }
  return list.sort((a, b) => a.getTime() - b.getTime()).slice(0, TIME_SLOTS - 1);
}

export default function StartPicker({value: given, onChange}: {value: Date; onChange: (start: Date) => void}) {
  const now = new Date();
  const soonest = nextQuarter(now);
  const today = dayStart(now);
  // A start that slipped into the past (the tab left open) shows as now
  const value = given.getTime() < soonest.getTime() ? soonest : given;
  // On the quarter hour, not in the past
  const pick = (start: Date) => {
    tap();
    onChange(new Date(Math.max(nextQuarter(start).getTime(), soonest.getTime())));
  };

  // ─── Days ───
  const days = Array.from({length: DAYS_SHOWN}, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  // A day further out (from the calendar) shows in the calendar's tile
  const farDay = days.some((d) => sameDay(d, value)) ? null : dayStart(value);
  // Another day keeps the time you had, unless it's already gone by then
  const pickDay = (day: Date) => pick(at(day, value));

  // ─── Times for the day you picked ───
  const isToday = sameDay(value, now);
  const isNow = isToday && value.getTime() <= soonest.getTime();
  const times = timesFor(value, now);
  // Any other time (7:45, or one chosen for your ideas) shows in "Other"'s place
  const other = !isNow && !times.some((d) => d.getTime() === value.getTime()) ? value : null;
  // Empty places keep "Other" in the last one (late at night: just "Now")
  const blanks = TIME_SLOTS - times.length - (isToday ? 1 : 0);

  // ─── The pickers for "Other" and the calendar ───
  const [picking, setPicking] = useState<"time" | "date" | null>(null);
  const [draft, setDraft] = useState(value);
  const open = (mode: "time" | "date") => {
    tap();
    setDraft(value);
    setPicking(mode);
  };
  // A day from the calendar keeps the time; a time keeps the day
  const picked = (mode: "time" | "date", chosen: Date) =>
    pick(mode === "date" ? at(chosen, value) : at(value, chosen));
  // Android: the system dialog has closed with its answer
  const onAndroidPicked = (_event: unknown, chosen?: Date) => {
    const mode = picking;
    setPicking(null);
    if (chosen && mode) picked(mode, chosen);
  };

  return (
    <View className="gap-3">
      {/* The week, one row */}
      <View className="flex-row" style={{gap: 6}}>
        {days.map((d, i) => (
          <DayTile
            key={d.getTime()}
            top={i === 0 ? "Today" : d.toLocaleDateString([], {weekday: "short"})}
            bottom={String(d.getDate())}
            label={i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], {weekday: "long", month: "long", day: "numeric"})}
            on={!farDay && sameDay(d, value)}
            onPress={() => pickDay(d)}
          />
        ))}
        {farDay ? (
          <DayTile
            top={farDay.toLocaleDateString([], {month: "short"})}
            bottom={String(farDay.getDate())}
            label={`${farDay.toLocaleDateString([], {weekday: "long", month: "long", day: "numeric"})}. Pick another day`}
            on
            onPress={() => open("date")}
          />
        ) : (
          <DayTile icon="calendar-outline" label="Another day" onPress={() => open("date")} />
        )}
      </View>

      {/* Likely times for that day, then "Other", always last */}
      <View className="flex-row" style={{gap: 8}}>
        {isToday && <TimeChip label="Now" on={isNow} onPress={() => pick(soonest)} />}
        {times.map((d) => (
          <TimeChip
            key={d.getTime()}
            label={timeLabel(d)}
            on={!isNow && d.getTime() === value.getTime()}
            onPress={() => pick(d)}
          />
        ))}
        {Array.from({length: Math.max(0, blanks)}, (_, i) => (
          <View key={`blank-${i}`} className="flex-1" />
        ))}
        <TimeChip
          label={other ? timeLabel(other) : "Other"}
          a11yLabel={other ? `${timeLabel(other)}. Pick another time` : "Another time"}
          icon="time-outline"
          on={!!other}
          onPress={() => open("time")}
        />
      </View>

      {/* Android: the system dialogs */}
      {Platform.OS === "android" && picking && (
        <DateTimePicker
          value={draft}
          mode={picking}
          minimumDate={picking === "date" ? today : undefined}
          onValueChange={onAndroidPicked}
          onDismiss={() => setPicking(null)}
        />
      )}

      {/* iOS: a sheet with the calendar, or a time wheel in 15s */}
      {Platform.OS === "ios" && (
        <Modal visible={picking != null} transparent animationType="none" onRequestClose={() => setPicking(null)}>
          {picking && (
            <PickSheet
              key={picking}
              mode={picking}
              start={draft}
              today={today}
              onPick={(chosen) => picked(picking, chosen)}
              onClose={() => setPicking(null)}
            />
          )}
        </Modal>
      )}
    </View>
  );
}

const OPEN_MS = 260;
const CLOSE_MS = 200;

/**
 * iOS: the calendar (a tap picks the day) or a time wheel (Done picks it).
 * The backdrop fades in while the sheet slides up, and both go back on
 * closing (a Modal's own "slide" moves the backdrop with it), as in
 * components/builder/StopLengthSheet.tsx.
 */
function PickSheet({
  mode,
  start,
  today,
  onPick,
  onClose,
}: {
  mode: "time" | "date";
  start: Date;
  today: Date;
  onPick: (chosen: Date) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(start);
  const {height: screenHeight} = useWindowDimensions();
  // One value each for where the sheet is and how dark the backdrop is, made
  // once and never swapped (a new interpolation let go of the sheet for a
  // frame, showing it fully open). It slides from a whole screen down, not
  // its own height: the calendar lays itself out a moment late, so a measured
  // height starts it almost in place. Eased out, it's on screen at once.
  const [y] = useState(() => new Animated.Value(screenHeight));
  const [fade] = useState(() => new Animated.Value(0));
  const move = (to: {y: number; fade: number}, duration: number, easing: (t: number) => number) =>
    Animated.parallel([
      Animated.timing(y, {toValue: to.y, duration, easing, useNativeDriver: true}),
      Animated.timing(fade, {toValue: to.fade, duration, useNativeDriver: true}),
    ]);
  useEffect(() => {
    move({y: 0, fade: 1}, OPEN_MS, Easing.out(Easing.cubic)).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Slide away and fade out, then close (picking first, so the chips are
  // already showing it as the sheet goes)
  const leave = (chosen?: Date) => {
    if (chosen) onPick(chosen);
    move({y: screenHeight, fade: 0}, CLOSE_MS, Easing.in(Easing.cubic)).start(onClose);
  };

  return (
    <View className="flex-1 justify-end">
      {/* Backdrop: fades (classes on the plain view inside; NativeWind doesn't
          reliably style Animated views) */}
      <Animated.View style={[StyleSheet.absoluteFill, {opacity: fade}]}>
        <Pressable className="flex-1 bg-black/60" onPress={() => leave()} accessibilityLabel="Close" />
      </Animated.View>

      {/* Sheet: slides */}
      <Animated.View
        style={{transform: [{translateY: y}]}}
      >
        <View className="bg-zinc-950 border-t border-zinc-800 p-6 pb-12 rounded-t-3xl">
          <View className="flex-row justify-between items-center mb-4">
            <Pressable onPress={() => leave()} hitSlop={8}>
              <Text className="text-zinc-400 font-semibold text-base">Cancel</Text>
            </Pressable>
            <Text className="text-white font-bold text-lg">{mode === "date" ? "Pick a day" : "Pick a time"}</Text>
            {mode === "time" ? (
              <Pressable onPress={() => leave(draft)} hitSlop={8}>
                <Text className="text-white font-bold text-base">Done</Text>
              </Pressable>
            ) : (
              // (the calendar closes as you tap a day)
              <View style={{width: 48}} />
            )}
          </View>
          <DateTimePicker
            value={draft}
            mode={mode}
            display={mode === "date" ? "inline" : "spinner"}
            minimumDate={mode === "date" ? today : undefined}
            minuteInterval={15}
            onValueChange={(_event, chosen) => {
              if (!chosen) return;
              if (mode === "date") leave(chosen);
              else setDraft(chosen);
            }}
            themeVariant="dark"
            textColor="white"
            accentColor="#f59e0b"
          />
        </View>
      </Animated.View>
    </View>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** A day in the week strip: weekday over the date (or the calendar icon) */
function DayTile({
  top,
  bottom,
  icon,
  label,
  on = false,
  onPress,
}: {
  top?: string;
  bottom?: string;
  icon?: IconName;
  /** For VoiceOver ("Saturday, November 28") */
  label: string;
  on?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected: on}}
      className={`flex-1 h-14 items-center justify-center rounded-2xl border active:opacity-70 ${
        on ? "bg-zinc-700 border-zinc-500" : "bg-zinc-900 border-zinc-800"
      }`}
    >
      {icon ? (
        <Ionicons name={icon} size={18} color={on ? "white" : "#a1a1aa"} />
      ) : (
        <>
          <Text
            className={`text-[10px] font-bold uppercase ${on ? "text-zinc-200" : "text-zinc-500"}`}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {top}
          </Text>
          <Text className={`text-base font-extrabold ${on ? "text-white" : "text-zinc-300"}`}>{bottom}</Text>
        </>
      )}
    </Pressable>
  );
}

/** A time in the row (a quarter of it) */
function TimeChip({
  label,
  a11yLabel,
  icon,
  on = false,
  onPress,
}: {
  label: string;
  /** For VoiceOver, when it says more than the label */
  a11yLabel?: string;
  icon?: IconName;
  on?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{selected: on}}
      className={`flex-1 h-11 flex-row items-center justify-center gap-1 rounded-xl border active:opacity-70 ${
        on ? "bg-zinc-700 border-zinc-500" : "bg-zinc-900 border-zinc-800"
      }`}
    >
      {icon && <Ionicons name={icon} size={13} color={on ? "white" : "#a1a1aa"} />}
      <Text
        className={`font-bold text-sm ${on ? "text-white" : "text-zinc-300"}`}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  );
}
