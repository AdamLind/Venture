// utils/closedTimes.ts
// The times of day a place is never open (#82), so the publisher can grey
// them out under "Best time of day" and the answer can't contradict the
// place's hours. Pure.
//
// A time of day counts as closed only when the place is shut for ALL of it
// on EVERY day of the week. Unknown hours close nothing (we never guess);
// 24/7 closes nothing; daylight-only places (sunrise to sunset) are shut
// late at night all year, and are open for part of the rest.

import {DAYLIGHT, parseOpeningHours} from "./openingHours";
import type {TimeOfDay} from "@/src/lib/timeOfDay";

/** Each time of day, in minutes after midnight (an end past 1440 runs past midnight) */
const WINDOWS: Record<TimeOfDay, [number, number]> = {
  EARLY_MORNING: [5 * 60, 8 * 60],
  MORNING: [8 * 60, 12 * 60],
  AFTERNOON: [12 * 60, 17 * 60],
  EVENING: [17 * 60, 21 * 60],
  LATE_NIGHT: [21 * 60, 28 * 60],
};

const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

/** The times of day this place is never open (empty when unknown or always open) */
export function closedTimesOfDay(hoursText: string | null | undefined): Set<TimeOfDay> {
  const closed = new Set<TimeOfDay>();
  if (!hoursText) return closed;
  if (hoursText.trim().toLowerCase() === DAYLIGHT) {
    // Even at midsummer, sunset is before 10 PM in most of the world
    closed.add("LATE_NIGHT");
    return closed;
  }
  const week = parseOpeningHours(hoursText);
  if (!week) return closed;

  for (const time of Object.keys(WINDOWS) as TimeOfDay[]) {
    const window = WINDOWS[time];
    const openSometime = week.some((spans, day) => {
      // Today's hours, and yesterday's that ran past midnight
      const yesterday = week[(day + 6) % 7].filter(([, to]) => to > 1440).map(([from, to]) => [from - 1440, to - 1440]);
      return [...spans, ...yesterday].some((span) => overlaps(span as [number, number], window));
    });
    if (!openSometime) closed.add(time);
  }
  return closed;
}
