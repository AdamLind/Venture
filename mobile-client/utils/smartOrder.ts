// utils/smartOrder.ts
// Smart reorder (#56): put a plan's stops in the best order the plan
// evaluator can find, and say what that fixes.
//
//   Up to EXACT_STOPS stops: try every order (at most 120) and keep the best.
//   More: start from the current order and keep moving single stops to
//   other positions while that raises the score (a "local search"); fast,
//   and almost always at or near the best order.
//
// Only offers a new order when it's clearly better (MIN_GAIN), so the plan
// doesn't shuffle over a rounding difference. Pure: no database or stores.

import type {UserPrefs} from "@/src/store/usePrefsStore";
import type {WeatherLookup} from "@/src/lib/weatherRules";
import type {PlacedActivity} from "./timeline";
import {type PlanEvaluation, type PlanIssue, evaluatePlan} from "./planEvaluator";

const EXACT_STOPS = 5;
/** A new order must beat the current one by this many points. */
const MIN_GAIN = 3;
/** Safety limit on improvement passes for long plans. */
const MAX_PASSES = 12;
/**
 * A new order that makes the day run longer (more travel) pays this much
 * per 15 minutes later it ends, so it has to fix enough to be worth it.
 */
const LATER_PER_15_MIN = 3;

export type SmartOrderResult = {
  order: PlacedActivity[];
  before: PlanEvaluation;
  after: PlanEvaluation;
  /** The new order is clearly better than the current one */
  improved: boolean;
  /** Problems the new order fixes (from the current order's list) */
  fixed: PlanIssue[];
  /** Problems the new order has that the current one doesn't (it's still better overall) */
  introduced: PlanIssue[];
  /** Fewer miles of driving (0 if none) */
  milesSaved: number;
  /** How much later (+) or sooner (-) the day ends with the new order, in minutes */
  endShiftMinutes: number;
  /** When the day ends with the new order (trip home included) */
  endsAt: number;
};

/** When a plan's last busy slot ends (trip home included). */
const endOf = (e: PlanEvaluation) =>
  e.timeline
    .filter((slot) => slot.type === "OCCUPIED")
    .reduce((end, slot) => Math.max(end, slot.endTime), 0);

const idOf = (p: PlacedActivity) => p.activity.idea_id as number;
const sameOrder = (a: PlacedActivity[], b: PlacedActivity[]) =>
  a.length === b.length && a.every((p, i) => idOf(p) === idOf(b[i]));

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) out.push([item, ...perm]);
  });
  return out;
}

/** The best order found for `placed` (and whether it beats the current one). */
export function smartOrder(
  placed: PlacedActivity[],
  prefs: UserPrefs,
  options: {weatherAt?: WeatherLookup | null} = {},
): SmartOrderResult {
  const evaluate = (order: PlacedActivity[]) =>
    evaluatePlan(order, prefs, undefined, {weatherAt: options.weatherAt});
  const before = evaluate(placed);
  const beforeEnd = endOf(before);
  // The score, minus a little for each 15 minutes later the day ends
  const worth = (e: PlanEvaluation) =>
    e.score - LATER_PER_15_MIN * Math.max(0, Math.ceil((endOf(e) - beforeEnd) / (15 * 60_000)));

  let best = placed;
  let bestEval = before;
  const consider = (order: PlacedActivity[]) => {
    const e = evaluate(order);
    // Ties go to fewer hard problems, then less driving
    const hard = (x: PlanEvaluation) => x.issues.filter((i) => i.severity === "hard").length;
    if (
      worth(e) > worth(bestEval) ||
      (worth(e) === worth(bestEval) &&
        (hard(e) < hard(bestEval) || (hard(e) === hard(bestEval) && e.routeMiles < bestEval.routeMiles - 0.05)))
    ) {
      best = order;
      bestEval = e;
    }
  };

  if (placed.length >= 2 && placed.length <= EXACT_STOPS) {
    for (const order of permutations(placed)) if (!sameOrder(order, placed)) consider(order);
  } else if (placed.length > EXACT_STOPS) {
    // Local search: move one stop anywhere else, keep any move that helps
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const start = best;
      for (let from = 0; from < start.length; from++) {
        for (let to = 0; to < start.length; to++) {
          if (from === to) continue;
          const order = [...start];
          const [moved] = order.splice(from, 1);
          order.splice(to, 0, moved);
          consider(order);
        }
      }
      if (best === start) break; // no move helped
    }
  }

  const improved = !sameOrder(best, placed) && worth(bestEval) >= before.score + MIN_GAIN;
  const key = (i: PlanIssue) => `${i.kind}:${i.stopId ?? ""}`;
  const after = improved ? bestEval : before;
  const remaining = new Set(after.issues.map(key));
  const existing = new Set(before.issues.map(key));
  return {
    order: improved ? best : placed,
    before,
    after,
    improved,
    fixed: improved ? before.issues.filter((i) => !remaining.has(key(i))) : [],
    introduced: improved ? after.issues.filter((i) => !existing.has(key(i))) : [],
    milesSaved: improved ? Math.max(0, before.routeMiles - after.routeMiles) : 0,
    endShiftMinutes: improved ? Math.round((endOf(after) - beforeEnd) / 60_000) : 0,
    endsAt: endOf(after),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "A better order fixes 2 problems and saves 4.1 mi of driving", or null if
 * nothing to say. Counts what it fixes (a new order can also bring up a
 * smaller note, which the card lists under "New"), so fixing a closed
 * bakery isn't hidden by a minor note it adds.
 */
export function smartOrderSummary(result: SmartOrderResult): string | null {
  if (!result.improved) return null;
  const parts: string[] = [];
  const fixed = result.fixed.length;
  const added = result.introduced.length;
  if (fixed > 0) parts.push(`fixes ${plural(fixed, "problem")}`);
  if (result.milesSaved >= 0.5) parts.push(`saves ${result.milesSaved.toFixed(1)} mi of driving`);
  if (parts.length === 0 && result.endShiftMinutes <= -15) {
    const m = -result.endShiftMinutes;
    const length = m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
    parts.push(`ends ${length} sooner`);
  }
  // Nothing to count: it still scores better (e.g. a closer fit to each idea's best time)
  if (parts.length === 0) return "Try a smoother order for your day";
  const tradeOff = fixed > 0 && added > 0 ? ` (${plural(added, "new note")})` : "";
  return `A better order ${parts.join(" and ")}${tradeOff}`;
}
