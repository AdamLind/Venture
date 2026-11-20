// utils/stretch.ts
// Stretching flexible ideas to fit a plan better. Stops run back to back, so
// an extra 15 or 30 minutes at one stop moves everything after it later:
// lunch at 11:30 instead of 10:45, dinner once you're hungry again, the
// gelato shop open by the time you get there.
//
//   - Only lengthens: shorter than suggested is a penalty of its own.
//   - Only flexible ideas, and never a length you set yourself.
//   - Up to MAX_STRETCH minutes per stop, in 15s (stops stay on the quarter hour).
//   - Each stretch has to fix something real (MIN_GAIN), one at a time,
//     best first, until none helps.
// Pure.

import type {UserPrefs} from "@/src/store/usePrefsStore";
import type {WeatherLookup} from "@/src/lib/weatherRules";
import {evaluatePlan} from "@/utils/planEvaluator";
import {type PlacedActivity, suggestedMinutes} from "@/utils/timeline";

/** The most a stop is stretched, in minutes */
export const MAX_STRETCH = 30;
const STEP = 15;
/** A stretch must raise the score this much (not chase a point) */
const MIN_GAIN = 5;

export type StretchResult = {
  placed: PlacedActivity[];
  /** The plan's score after stretching */
  score: number;
  /** Some stop was stretched */
  changed: boolean;
};

/** Whether a stop can be stretched: flexible, at its suggested length (or already stretched) */
const canStretch = (p: PlacedActivity) =>
  (p.activity as any).is_duration_variable !== false && (p.durationMinutes == null || p.stretchedBy != null);

/** `placed` with flexible stops stretched where it clearly helps (in the same order). */
export function stretchToFit(
  placed: PlacedActivity[],
  prefs: UserPrefs,
  options: {weatherAt?: WeatherLookup | null} = {},
): StretchResult {
  const scoreOf = (order: PlacedActivity[]) =>
    evaluatePlan(order, prefs, undefined, {weatherAt: options.weatherAt}).score;
  let current = placed;
  let score = scoreOf(placed);

  // Each pass keeps the single stretch that helps most
  for (let pass = 0; pass < placed.length * (MAX_STRETCH / STEP); pass++) {
    let bestMove: {placed: PlacedActivity[]; score: number} | null = null;
    for (let i = 0; i < current.length; i++) {
      const p = current[i];
      if (!canStretch(p)) continue;
      const already = p.stretchedBy ?? 0;
      for (let by = already + STEP; by <= MAX_STRETCH; by += STEP) {
        const next = [...current];
        next[i] = {...p, durationMinutes: suggestedMinutes(p.activity) + by, stretchedBy: by};
        const nextScore = scoreOf(next);
        if (nextScore >= score + MIN_GAIN && (!bestMove || nextScore > bestMove.score)) {
          bestMove = {placed: next, score: nextScore};
        }
      }
    }
    if (!bestMove) break;
    ({placed: current, score} = bestMove);
  }
  return {placed: current, score, changed: current !== placed};
}
