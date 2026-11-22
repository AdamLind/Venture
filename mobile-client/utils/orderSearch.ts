// utils/orderSearch.ts
// Trying every order of a few stops, without trying the ones that can't win
// (branch and bound). Used by smart reorder and by the best start time.
//
// Orders are built one stop at a time, like a family tree. A plan scores
// 100 minus its penalties, and penalties only add up, so some are settled
// as soon as two stops sit side by side, whatever comes after and whenever
// the date starts: two meals in a row, dessert right before dinner, an
// active stop straight after a meal, too full or worn out, a stop cut
// short, a lively stop after a calm one. If a partial order's settled penalties already put it below the
// best complete order found so far, every order that starts that way is
// skipped.
//
// The clock's penalties (hours, best times, daylight, weather) can't be
// settled from a partial order, but each stop has a least it can ever pay
// (timeFloor: at its best possible time). Their sum, the "floor", comes off
// every order's ceiling too, which skips more when some stop can't avoid a
// penalty (closed all weekend, rain every day).

import type {UserPrefs} from "@/src/store/usePrefsStore";
import type {WeatherLookup} from "@/src/lib/weatherRules";
import {type PlanIssue, type PlanIssueKind, evaluatePlan} from "@/utils/planEvaluator";
import {type PlacedActivity, stopLocation, stopMinutes} from "@/utils/timeline";

/** The best a plan can score (no penalties) */
export const PERFECT_SCORE = 100;

/** Penalties that don't depend on when the date starts */
const SETTLED: ReadonlySet<PlanIssueKind> = new Set<PlanIssueKind>([
  "BACK_TO_BACK_MEALS",
  "STILL_FULL",
  "BACK_TO_BACK_ACTIVE",
  "WORN_OUT",
  "ACTIVE_AFTER_MEAL",
  "SHORTENED",
  "TREAT_BEFORE_MEAL",
  "WINDS_BACK_UP",
]);
/** These are about the stop after: not settled for the last stop of a partial order */
const NEEDS_NEXT: ReadonlySet<PlanIssueKind> = new Set<PlanIssueKind>(["TREAT_BEFORE_MEAL"]);

/** Penalties that depend only on when a stop happens (its own start and end) */
const CLOCK: ReadonlySet<PlanIssueKind> = new Set<PlanIssueKind>([
  "OFF_HOURS",
  "CLOSED",
  "PART_CLOSED",
  "AFTER_DARK",
  "ODD_MEAL_TIME",
  "OUT_OF_SEASON",
  "TOO_COLD",
  "TOO_HOT",
  "RAIN",
  "WIND",
  "NO_SNOW",
]);

/** What a partial order already costs, whatever follows and whenever it starts */
export function settledPenalty(prefix: PlacedActivity[], prefs: UserPrefs): number {
  if (prefix.length < 2) return 0;
  const lastId = prefix[prefix.length - 1].activity.idea_id;
  return evaluatePlan(prefix, prefs)
    .issues.filter(
      (issue) =>
        issue.stopId != null &&
        SETTLED.has(issue.kind) &&
        !(issue.stopId === lastId && NEEDS_NEXT.has(issue.kind)),
    )
    .reduce((sum, issue) => sum + issue.penalty, 0);
}

/** The clock's penalties in a plan's issues (all stops, or one) */
export function clockPenalties(issues: PlanIssue[], stopId?: number): number {
  return issues
    .filter((issue) => issue.stopId != null && CLOCK.has(issue.kind) && (stopId == null || issue.stopId === stopId))
    .reduce((sum, issue) => sum + issue.penalty, 0);
}

/**
 * What a stop pays in the clock's penalties if it starts at `startMs`
 * (wherever it sits in a date: they depend only on its own start and end).
 */
export function clockPenaltyAt(
  placed: PlacedActivity,
  prefs: UserPrefs,
  startMs: number,
  weatherAt: WeatherLookup | null = null,
): number {
  // The stop alone, starting then (no drive: you start where it is), with
  // room so it never runs past the end
  const alone: UserPrefs = {
    ...prefs,
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(startMs + stopMinutes(placed) * 60_000 + 12 * 3_600_000).toISOString(),
    currentLocation: stopLocation(placed.activity, prefs) ?? prefs.currentLocation,
  };
  return clockPenalties(evaluatePlan([placed], alone, undefined, {weatherAt}).issues, placed.activity.idea_id);
}

/**
 * The least a stop can pay in the clock's penalties if it starts anywhere
 * from `fromMs` to `toMs`: checked every 5 minutes (stops always start on
 * the 5 minutes: starts are, and lengths and drives come in 15s), so it's
 * exact. Stops at the first time it pays nothing. `at` can be a cached
 * clockPenaltyAt.
 */
export function timeFloor(
  fromMs: number,
  toMs: number,
  at: (startMs: number) => number,
): number {
  const STEP = 5 * 60_000;
  let least = Infinity;
  for (let t = Math.ceil(fromMs / STEP) * STEP; t <= toMs; t += STEP) {
    least = Math.min(least, at(t));
    if (least === 0) break;
  }
  return Number.isFinite(least) ? least : 0;
}

/**
 * Visits every order of `placed` that could beat the best seen so far.
 * `visit` scores a complete order (higher is better; never more than its
 * plan score) and returns it. `startBest`: a score to beat from the start
 * (e.g. the current order's). `floor`: penalties every order pays whatever
 * its order (the stops' timeFloor sum). `boundLeaves`: check the ceiling
 * before visiting a complete order too (when visiting is costly). `stop`:
 * a time budget; the search ends early when it says so. Stops at a perfect
 * order.
 */
export function searchOrders(
  placed: PlacedActivity[],
  prefs: UserPrefs,
  visit: (order: PlacedActivity[]) => number,
  startBest = -Infinity,
  options: {floor?: number; boundLeaves?: boolean; stop?: () => boolean} = {},
): void {
  const {floor = 0, boundLeaves = false, stop} = options;
  const n = placed.length;
  if (n === 0) return;
  let best = startBest;
  const used = new Array<boolean>(n).fill(false);
  const path: PlacedActivity[] = [];
  const ceiling = PERFECT_SCORE - floor;

  const extend = (): boolean => {
    if (stop?.()) return true;
    if (path.length === n) {
      if (boundLeaves && ceiling - settledPenalty(path, prefs) < best) return false;
      best = Math.max(best, visit([...path]));
      // Nothing beats the best possible: stop looking
      return best >= ceiling;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(placed[i]);
      // Already can't win: skip every order that starts like this
      const hopeless = path.length >= 2 && path.length < n && ceiling - settledPenalty(path, prefs) < best;
      const done = !hopeless && extend();
      path.pop();
      used[i] = false;
      if (done) return true;
    }
    return false;
  };
  extend();
}
