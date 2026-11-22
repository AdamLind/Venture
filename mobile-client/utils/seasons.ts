// utils/seasons.ts
// When in the year an idea works (#21): activities.months (1-12; all twelve
// is any time; null = not answered, counts as any time) and
// activities.holidays (only around those holidays: utils/holidays.ts).
// Pure. Checked against the date being planned.

import {HOLIDAYS, type HolidayId, holidaysOn} from "./holidays";

export type Season = "SPRING" | "SUMMER" | "FALL" | "WINTER";

export const SEASONS: {value: Season; label: string}[] = [
  {value: "SPRING", label: "Spring"},
  {value: "SUMMER", label: "Summer"},
  {value: "FALL", label: "Fall"},
  {value: "WINTER", label: "Winter"},
];

export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Meteorological seasons, north of the equator */
const NORTH: Record<Season, number[]> = {
  SPRING: [3, 4, 5],
  SUMMER: [6, 7, 8],
  FALL: [9, 10, 11],
  WINTER: [12, 1, 2],
};

/** The season a date falls in, where you are */
export function seasonOn(date: Date, latitude: number | null | undefined): Season {
  const month = date.getMonth() + 1;
  return (Object.keys(NORTH) as Season[]).find((season) => seasonMonths(season, latitude).includes(month))!;
}

/** Each season's icon (Ionicons) */
export const SEASON_ICONS: Record<Season, string> = {
  SPRING: "flower-outline",
  SUMMER: "sunny-outline",
  FALL: "leaf-outline",
  WINTER: "snow-outline",
};

/** A season's months where the place is (six months later south of the equator) */
export function seasonMonths(season: Season, latitude: number | null | undefined): number[] {
  const months = NORTH[season];
  return latitude != null && latitude < 0 ? months.map((m) => ((m + 5) % 12) + 1) : months;
}

const holidaysOf = (activity: any): HolidayId[] => (Array.isArray(activity?.holidays) ? activity.holidays : []);
const monthsOf = (activity: any): number[] | null =>
  Array.isArray(activity?.months) && activity.months.length > 0 ? activity.months : null;

/** It works on this date (any time, unknown, or in its months / around its holiday) */
export function inSeason(activity: any, date: Date): boolean {
  const holidays = holidaysOf(activity);
  if (holidays.length > 0) return holidaysOn(date).some((holiday) => holidays.includes(holiday.id));
  const months = monthsOf(activity);
  return !months || months.includes(date.getMonth() + 1);
}

/** Only part of the year (some months, or around a holiday) */
export const isSeasonal = (activity: any) =>
  holidaysOf(activity).length > 0 || (monthsOf(activity)?.length ?? 12) < 12;

/** "Sep–Nov", "Dec–Feb", "Oct", "Mar–May, Sep–Nov" (runs wrap past December) */
export function monthsLabel(months: number[]): string {
  const set = new Set(months);
  if (set.size === 0) return "";
  if (set.size === 12) return "Any time";
  // Start each run at a month whose previous month is missing
  const runs: [number, number][] = [];
  for (const m of ALL_MONTHS) {
    const prev = ((m + 10) % 12) + 1;
    if (!set.has(m) || set.has(prev)) continue;
    let end = m;
    while (set.has((end % 12) + 1) && (end % 12) + 1 !== m) end = (end % 12) + 1;
    runs.push([m, end]);
  }
  return runs
    .map(([from, to]) => (from === to ? MONTH_NAMES[from - 1] : `${MONTH_NAMES[from - 1]}–${MONTH_NAMES[to - 1]}`))
    .join(", ");
}

/** When it's in season, in words ("Sep–Nov", "Around Christmas"); null if any time */
export function seasonText(activity: any): string | null {
  const holidays = holidaysOf(activity);
  if (holidays.length > 0) {
    const labels = HOLIDAYS.filter((h) => holidays.includes(h.id)).map((h) => h.label);
    return `Around ${labels.join(" or ")}`;
  }
  const months = monthsOf(activity);
  return months && months.length < 12 ? monthsLabel(months) : null;
}
