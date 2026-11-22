// utils/holidays.ts
// The holidays people plan dates around (#21), and when each one's season
// is, for any year. Pure, and plain calendar rules: no lookups, no network.
//
// A holiday's window is when it shapes dates, not just the day itself:
// Valentine's is the week leading up to it, Halloween all of October,
// Christmas from the day after Thanksgiving. Checked against the date
// being planned, not today (planning December 20th in early November should
// count as Christmas).
//
// US holidays for the launch; other countries can get their own lists.
// `vibes`: tags that describe the holiday's dates well enough to offer as a
// one-tap preset (src/constants/tags.ts). Only where they really do: Halloween
// and Christmas are about specific ideas (haunted houses, lights), which the
// time-of-year question covers, not about a kind of tag.

export type HolidayId = "VALENTINES" | "INDEPENDENCE_DAY" | "HALLOWEEN" | "CHRISTMAS" | "NEW_YEARS_EVE";

export type Holiday = {
  id: HolidayId;
  label: string;
  emoji: string;
  /** The tags its dates are about, when they describe them well (a one-tap preset) */
  vibes: string[] | null;
  /** First and last day of its season in `year` (local dates, inclusive) */
  window: (year: number) => {from: Date; to: Date};
};

const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);

/** The nth weekday of a month (weekday: 0 = Sunday): Thanksgiving is the 4th Thursday of November */
export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = day(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return day(year, month, 1 + offset + (n - 1) * 7);
}

export const thanksgiving = (year: number) => nthWeekday(year, 11, 4, 4);

export const HOLIDAYS: Holiday[] = [
  {
    id: "VALENTINES",
    label: "Valentine's",
    emoji: "❤️",
    vibes: ["romantic", "upscale", "desserts"],
    window: (year) => ({from: day(year, 2, 7), to: day(year, 2, 14)}),
  },
  {
    id: "INDEPENDENCE_DAY",
    label: "Fourth of July",
    emoji: "🎆",
    vibes: null,
    window: (year) => ({from: day(year, 7, 1), to: day(year, 7, 4)}),
  },
  {
    id: "HALLOWEEN",
    label: "Halloween",
    emoji: "🎃",
    vibes: null,
    window: (year) => ({from: day(year, 10, 1), to: day(year, 10, 31)}),
  },
  {
    id: "CHRISTMAS",
    label: "Christmas",
    emoji: "🎄",
    vibes: null,
    window: (year) => {
      const after = thanksgiving(year);
      return {from: day(year, 11, after.getDate() + 1), to: day(year, 12, 25)};
    },
  },
  {
    id: "NEW_YEARS_EVE",
    label: "New Year's Eve",
    emoji: "✨",
    vibes: ["upscale", "music", "festivals"],
    window: (year) => ({from: day(year, 12, 30), to: day(year, 12, 31)}),
  },
];

/** The holidays whose season includes this date (by its local calendar day) */
export function holidaysOn(date: Date): Holiday[] {
  const today = day(date.getFullYear(), date.getMonth() + 1, date.getDate()).getTime();
  return HOLIDAYS.filter((holiday) => {
    const {from, to} = holiday.window(date.getFullYear());
    return today >= from.getTime() && today <= to.getTime();
  });
}

/** The holiday to offer as a preset on this date: one whose tags describe its dates */
export const holidayPreset = (date: Date): Holiday | null =>
  holidaysOn(date).find((holiday) => holiday.vibes) ?? null;
