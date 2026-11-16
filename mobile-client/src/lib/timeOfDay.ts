// src/lib/timeOfDay.ts
// An idea's "time of day" (activities.time_of_day) as clock windows.
// Ideas don't have an exact start time, just when they're best:
//
//   EARLY_MORNING  5 AM – 8 AM      (starts at 6 AM when we pick for you)
//   MORNING        8 AM – noon      (9 AM)
//   AFTERNOON      noon – 5 PM      (1 PM)
//   EVENING        5 PM – 9 PM      (6 PM)
//   LATE_NIGHT     9 PM – 2 AM      (9 PM)
//
// Older ideas say "NIGHT"; it means LATE_NIGHT.

export type TimeOfDay =
  | "EARLY_MORNING"
  | "MORNING"
  | "AFTERNOON"
  | "EVENING"
  | "LATE_NIGHT";

const WINDOWS: Record<
  TimeOfDay,
  {from: number; to: number; startAt: number; phrase: string}
> = {
  // `to` past 24 wraps past midnight
  EARLY_MORNING: {from: 5, to: 8, startAt: 6, phrase: "early in the morning"},
  MORNING: {from: 8, to: 12, startAt: 9, phrase: "in the morning"},
  AFTERNOON: {from: 12, to: 17, startAt: 13, phrase: "in the afternoon"},
  EVENING: {from: 17, to: 21, startAt: 18, phrase: "in the evening"},
  LATE_NIGHT: {from: 21, to: 26, startAt: 21, phrase: "late at night"},
};

const ORDER = Object.keys(WINDOWS) as TimeOfDay[];

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  EARLY_MORNING: "Early morning",
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  EVENING: "Evening",
  LATE_NIGHT: "Late night",
};

/** Known windows, in day order. Empty means "any time". */
export function normalizeTimeOfDay(values: readonly string[] | null | undefined): TimeOfDay[] {
  const set = new Set(
    (values ?? []).map((v) => (v === "NIGHT" ? "LATE_NIGHT" : v)),
  );
  return ORDER.filter((t) => set.has(t));
}

/** Whether `at` falls in one of the idea's windows (no windows: always). */
export function isGoodTime(values: readonly string[] | null | undefined, at: Date): boolean {
  const windows = normalizeTimeOfDay(values);
  if (windows.length === 0) return true;
  const hour = at.getHours() + at.getMinutes() / 60;
  return windows.some((t) => {
    const {from, to} = WINDOWS[t];
    return (hour >= from && hour < to) || (hour + 24 >= from && hour + 24 < to);
  });
}

/**
 * `from` if it's a good time already, otherwise the next window's usual
 * start (today or tomorrow).
 */
export function nextGoodStart(values: readonly string[] | null | undefined, from: Date): Date {
  const windows = normalizeTimeOfDay(values);
  if (windows.length === 0 || isGoodTime(windows, from)) return from;

  let best: Date | null = null;
  for (const dayOffset of [0, 1]) {
    for (const t of windows) {
      const candidate = new Date(from);
      candidate.setDate(candidate.getDate() + dayOffset);
      candidate.setHours(WINDOWS[t].startAt, 0, 0, 0);
      if (candidate > from && (!best || candidate < best)) best = candidate;
    }
  }
  return best ?? from;
}

/** "Best in the evening", "Best in the morning or afternoon", or null. */
export function bestTimeLabel(values: readonly string[] | null | undefined): string | null {
  const windows = normalizeTimeOfDay(values);
  if (windows.length === 0 || windows.length === ORDER.length) return null;
  const phrases = windows.map((t) => WINDOWS[t].phrase);
  const joined =
    phrases.length <= 2
      ? phrases.join(" or ")
      : `${phrases.slice(0, -1).join(", ")}, or ${phrases[phrases.length - 1]}`;
  return `Best ${joined}`;
}
