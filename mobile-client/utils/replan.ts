// utils/replan.ts
// Reordering the rest of a live date (#63). Pure (no database or stores).
//
// Where the rest of the date starts from (replanPoint):
//   - stops you've finished or are at stay where they are ("kept")
//   - you're at a stop: the rest starts when it's scheduled to end (or
//     now, if that's passed), from that stop
//   - between stops: the rest starts now, from where you are (your phone's
//     location; the last finished stop's place without it)
//   - before the date has started: from the plan's own start and place
//
// Saving (applyReplan) lays the whole date out again (deriveReplannedTimeline),
// so the stored stop times, the date's end and the re-plan points all agree,
// and any device rebuilds the same timeline from them.

import type {UserPrefs} from "@/src/store/usePrefsStore";
import type {TimeSlot} from "@/types/itinerary";
import {
  type LatLng,
  type PlacedActivity,
  type Replan,
  deriveReplannedTimeline,
  homeOf,
  isOpenEnded,
  stopLocation,
} from "./timeline";

/** How far out an open-ended date's rest runs (it has no end to go past) */
const OPEN_ENDED_ROOM_MS = 48 * 3_600_000;

/** Re-planned starts land on the next 5 minutes */
const ROUND_MS = 5 * 60_000;

export type ReplanPoint = {
  /** How many stops stay as they are (finished, or the one you're at) */
  kept: number;
  /** When the rest starts */
  startMs: number;
  /** Where the rest starts from */
  location: LatLng | null;
  /** You're at the last kept stop (the rest waits for it to end) */
  atStop: boolean;
};

/** The planning prefs, plus where the date has been re-planned from */
export type DatePrefs = UserPrefs & {replans?: Replan[]};

/** ~100 m: enough for travel times, without storing your exact spot */
const roughly = (p: LatLng | null): LatLng | null =>
  p
    ? {
        latitude: Math.round(p.latitude * 1000) / 1000,
        longitude: Math.round(p.longitude * 1000) / 1000,
      }
    : null;

/**
 * Where the rest of a live date starts from. `stops` are the timeline's stop
 * slots in order; done / arrived follow the live screen (your taps, or the
 * clock).
 */
export function replanPoint({
  stops,
  prefs,
  now,
  doneIds,
  arrivedIds,
  here,
}: {
  stops: TimeSlot[];
  prefs: DatePrefs;
  now: number;
  doneIds: number[];
  arrivedIds: number[];
  /** Your phone's location, if known */
  here: LatLng | null;
}): ReplanPoint {
  const id = (s: TimeSlot) => s.activity?.idea_id as number;
  const done = (s: TimeSlot) => doneIds.includes(id(s)) || now >= s.endTime;
  const arrived = (s: TimeSlot) => arrivedIds.includes(id(s)) || now >= s.startTime;

  const firstAhead = stops.findIndex((s) => !done(s) && !arrived(s));
  const kept = firstAhead === -1 ? stops.length : firstAhead;
  const last = kept > 0 ? stops[kept - 1] : null;
  const atStop = !!last && !done(last);
  const roundUp = (ms: number) => Math.ceil(ms / ROUND_MS) * ROUND_MS;

  if (kept === 0) {
    const planStart = new Date(prefs.startDate).getTime();
    if (now < planStart) {
      // Not started: the plan's own start and place
      return {kept, startMs: planStart, location: null, atStop: false};
    }
    return {kept, startMs: roundUp(now), location: roughly(here), atStop: false};
  }
  if (atStop) {
    return {
      kept,
      startMs: roundUp(Math.max(now, last!.endTime)),
      location: stopLocation(last!.activity, prefs),
      atStop,
    };
  }
  return {
    kept,
    startMs: roundUp(now),
    location: roughly(here) ?? stopLocation(last!.activity, prefs),
    atStop,
  };
}

/** The prefs the rest of the date is laid out with (for the evaluator). */
export function restPrefs(prefs: DatePrefs, point: ReplanPoint): DatePrefs {
  return {
    ...prefs,
    startDate: new Date(point.startMs).toISOString(),
    // Open-ended stays open-ended ("no end time" is a 12-hour window from
    // the plan's start; from a later start it would look like a real end)
    endDate: isOpenEnded(prefs)
      ? new Date(point.startMs + OPEN_ENDED_ROOM_MS).toISOString()
      : prefs.endDate,
    currentLocation: point.location ?? prefs.currentLocation,
    // Home stays the date's home (homeOf would take a start near it for home)
    fixedHome: homeOf(prefs),
  };
}

/**
 * The whole date with the rest in a new order: the re-plan points to save
 * (earlier ones kept, later ones replaced by this one) and the timeline
 * they produce.
 */
export function applyReplan(
  placed: PlacedActivity[],
  prefs: DatePrefs,
  point: ReplanPoint,
  rest: PlacedActivity[],
): {placed: PlacedActivity[]; replans: Replan[]; timeline: TimeSlot[]} {
  const kept = placed.slice(0, point.kept);
  // Finished early (you tapped Done, and the rest starts before it was due
  // to end): it ends when you left, so the timeline doesn't overlap and the
  // saved times say it's over
  if (!point.atStop && point.kept > 0) {
    const before = deriveReplannedTimeline(placed, prefs, prefs.replans).filter((s) => s.activity);
    const last = before[point.kept - 1];
    if (last && last.endTime > point.startMs) {
      kept[point.kept - 1] = {
        ...kept[point.kept - 1],
        durationMinutes: Math.max(1, Math.round((point.startMs - last.startTime) / 60_000)),
      };
    }
  }
  const all = [...kept, ...rest];
  const replans: Replan[] = [
    ...(prefs.replans ?? []).filter((r) => r.kept < point.kept),
    {
      kept: point.kept,
      startDate: new Date(point.startMs).toISOString(),
      location: point.location,
    },
  ];
  return {placed: all, replans, timeline: deriveReplannedTimeline(all, prefs, replans)};
}
