// src/lib/timeOfDay.ts
// An idea's "time of day" (activities.time_of_day) as clock windows.
// Ideas don't have an exact start time, just when they're best:
//
//   EARLY_MORNING  5 AM – 8 AM      (starts at 6 AM when we pick for you)
//   MORNING        8 AM – noon      (9 AM)
//   AFTERNOON      noon – 5 PM      (1 PM)
//   EVENING        5 PM – 9 PM      (6 PM)
//   LATE_NIGHT     9 PM – 4 AM      (9 PM)  (stargazing at 2 AM is late
//                                            night; 4-5 AM is no window)
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
  LATE_NIGHT: {from: 21, to: 28, startAt: 21, phrase: "late at night"},
};

const ORDER = Object.keys(WINDOWS) as TimeOfDay[];

/** An idea's best-time windows in hours of the day (`to` past 24 runs past midnight) */
export function timeOfDayWindows(values: readonly string[] | null | undefined): {from: number; to: number}[] {
  return normalizeTimeOfDay(values).map((t) => ({from: WINDOWS[t].from, to: WINDOWS[t].to}));
}

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

/** The window as a plain noun ("early morning", "afternoon") */
const noun = (t: TimeOfDay) => TIME_OF_DAY_LABEL[t].toLowerCase();

/** "a", "a or b", "a, b, or c" */
const orList = (items: string[]) =>
  items.length <= 2 ? items.join(" or ") : `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;

/**
 * "Best in the evening", "Best in the morning, afternoon, or evening",
 * "Best in the evening or late at night", "Best from early morning to
 * evening" (four or more in a row), or null (any time).
 */
export function bestTimeLabel(values: readonly string[] | null | undefined): string | null {
  const windows = normalizeTimeOfDay(values);
  if (windows.length === 0 || windows.length === ORDER.length) return null;

  // Four or more back to back: a range is shorter than the list
  const first = ORDER.indexOf(windows[0]);
  const inARow = windows.every((t, i) => ORDER.indexOf(t) === first + i);
  if (inARow && windows.length >= 4) {
    return `Best from ${noun(windows[0])} to ${noun(windows[windows.length - 1])}`;
  }

  // "in the" once for the daytime ones; late night reads "late at night"
  const day = windows.filter((t) => t !== "LATE_NIGHT").map(noun);
  const items = [
    ...day.map((d, i) => (i === 0 ? `in the ${d}` : d)),
    ...(windows.includes("LATE_NIGHT") ? [WINDOWS.LATE_NIGHT.phrase] : []),
  ];
  return `Best ${orList(items)}`;
}
