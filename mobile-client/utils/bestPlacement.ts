// utils/bestPlacement.ts
// Where a new stop fits best in a plan (#59). The builder used to judge
// every suggestion as if it went on the end; this tries it in every slot
// (before the first stop, between each pair, after the last) and keeps the
// best one, so a café by the trailhead can go "between the hike and the
// movie" instead of ranking as 8 miles from the theater.
//
// "Best" uses the plan evaluator's rules, so a slot that runs past the end
// time, puts two meals back to back, or backtracks loses to one that doesn't.
// Pure (no database), like the evaluator.

import type {UserPrefs} from "@/src/store/usePrefsStore";
import type {WeatherLookup} from "@/src/lib/weatherRules";
import {evaluatePlan, type PlanEvaluation} from "./planEvaluator";
import {
  deriveSequentialTimeline,
  drivingMiles,
  isOpenEnded,
  type PlacedActivity,
} from "./timeline";
import {goesFartherFromHome} from "./reach";

export type Placement = {
  /** Where it goes in `placed` (placed.length = on the end) */
  index: number;
  /** The plan with it there */
  evaluation: PlanEvaluation;
  /** Extra driving it adds there, in miles (0 when staying in) */
  addedMiles: number;
  /** Still finishes (trip home included) by the end time */
  fits: boolean;
  /** On a trip, takes you farther from home than the stops around it
   *  (utils/reach.ts): the builder leaves these out of its suggestions */
  fartherFromHome: boolean;
  /**
   * Where it goes when that's not the end (the end is where you'd expect it,
   * so only other spots get called out): the stop it goes before, and the
   * one it goes after (null: before the first stop)
   */
  spot: {after: string | null; before: string} | null;
};

/** "between Canyon Hike and Movie", "before Gelato" */
export const spotLabel = (spot: NonNullable<Placement["spot"]>): string =>
  spot.after ? `between ${spot.after} and ${spot.before}` : `before ${spot.before}`;

/** When the plan's last busy slot ends (trip home included). */
const finishesAt = (timeline: ReturnType<typeof deriveSequentialTimeline>): number =>
  timeline
    .filter((slot) => slot.type === "OCCUPIED")
    .reduce((end, slot) => Math.max(end, slot.endTime), 0);

/**
 * Tries `activity` in every slot of `placed` and returns the best one:
 * slots that still fit the end time first, then ones that keep heading home
 * on a trip (dinner on the way back, not past the resort), then the evaluator's score, then
 * less extra driving, then later in the plan (the end, when it's a tie).
 */
export function bestPlacement(
  placed: PlacedActivity[],
  activity: any,
  prefs: UserPrefs,
  options: {weatherAt?: WeatherLookup | null; baseMiles?: number} = {},
): Placement {
  const baseMiles = options.baseMiles ?? drivingMiles(placed, prefs);
  const dayEnd = new Date(prefs.endDate).getTime();
  const openEnded = isOpenEnded(prefs);

  let best: Placement | null = null;
  for (let index = placed.length; index >= 0; index--) {
    const plan = [...placed.slice(0, index), {activity}, ...placed.slice(index)];
    const timeline = deriveSequentialTimeline(plan, prefs);
    const evaluation = evaluatePlan(plan, prefs, timeline, {weatherAt: options.weatherAt});
    const candidate: Placement = {
      index,
      evaluation,
      addedMiles: Math.max(0, drivingMiles(plan, prefs) - baseMiles),
      fits: openEnded || finishesAt(timeline) <= dayEnd,
      fartherFromHome: goesFartherFromHome(plan, index, prefs),
      spot:
        index < placed.length
          ? {
              after: index > 0 ? placed[index - 1].activity.title : null,
              before: placed[index].activity.title,
            }
          : null,
    };
    if (!best || better(candidate, best)) best = candidate;
  }
  return best!;
}

// Ties within half a mile count as the same drive (the later slot wins,
// since that's where it was searched first and the end is the least surprise)
const better = (a: Placement, b: Placement): boolean => {
  if (a.fits !== b.fits) return a.fits;
  if (a.fartherFromHome !== b.fartherFromHome) return !a.fartherFromHome;
  if (a.evaluation.score !== b.evaluation.score) return a.evaluation.score > b.evaluation.score;
  return a.addedMiles < b.addedMiles - 0.5;
};
