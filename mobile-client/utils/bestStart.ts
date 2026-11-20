// utils/bestStart.ts
// When to start a date planned around some ideas ("Plan a date with
// this / these"): the start time that gives the best date. Pure.
//
// Every start, every 5 minutes, in every order is checked, and still
// quickly, because a date's score splits in two:
//   - What depends on the order only: two meals in a row, still full, worn
//     out, backtracking, running past the end... Moving the start shifts
//     every stop by the same amount, so this part doesn't change.
//   - What depends on the clock: hours, best times, daylight, weather. Each
//     of these is about one stop at its own start and end.
// So each order is laid out once (how far into the date each stop starts),
// and each idea's clock penalty at each 5-minute start is worked out once,
// then remembered. Scoring an order at a start is then a few lookups:
// the order's part, minus each stop's clock penalty at (start + its offset).
//
// Orders that can't win are skipped (utils/orderSearch.ts): a partial order
// whose settled penalties, plus the least each idea can pay at its best
// time, already put it below the best found. Whole orders too, before
// scanning their starts. It stops at the best possible score (a perfect
// date ends the search at once). On a slow phone a time budget can end it
// early; the best found so far is used then.
//
// Starts off the quarter hour (2:50) pay OFF_QUARTER, so they only win when
// they're much better: stop lengths and drives come in 15s, so a quarter-hour
// start keeps every stop on the quarter hour.
//
// Then flexible ideas can stretch (utils/stretch.ts): near the best time, an
// extra 15 or 30 minutes at a stop is tried when it moves what follows into
// a better time.
//
// The current start stays unless another is clearly better; ties go to the
// time closest to it.

import type {UserPrefs} from "@/src/store/usePrefsStore";
import type {WeatherLookup} from "@/src/lib/weatherRules";
import type {ScoredActivity} from "@/types/itinerary";
import {PERFECT_SCORE, clockPenalties, clockPenaltyAt, searchOrders, timeFloor} from "@/utils/orderSearch";
import {type PlanEvaluation, evaluatePlan} from "@/utils/planEvaluator";
import {stretchToFit} from "@/utils/stretch";
import {type PlacedActivity, deriveSequentialTimeline, stopMinutes} from "@/utils/timeline";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Better by at least this much to move the start (a small preference isn't worth it) */
const MIN_GAIN = 5;
/** Starts land on the 5 minutes */
const STEP = 5 * MINUTE;
/** What a start off the quarter hour (2:50, 3:05) costs: it has to be this much better */
const OFF_QUARTER = 10;
/** How far from the best time stretching is tried (either way, on the quarter hours) */
const STRETCH_REACH = 60 * MINUTE;
/** Room for drives between stops, when working out how late a stop could start */
const DRIVE_ROOM = 60 * MINUTE;

type Args = {
  activities: ScoredActivity[];
  /** The plan's prefs (where you start, home, who's going); times are replaced */
  prefs: UserPrefs;
  /** How long the date runs */
  durationMinutes: number;
  /** The start the form has now */
  currentMs: number;
  nowMs: number;
  /** How many days ahead to look (from the current start's day) */
  days?: number;
  /** The earliest and latest start, in hours of the day */
  firstHour?: number;
  lastHour?: number;
  /** The forecast over the days searched (null: unknown, no weather rules) */
  weatherAt?: WeatherLookup | null;
  /** A time budget (ms); Infinity: always finish */
  budgetMs?: number;
};

export type BestStart = {
  startMs: number;
  changed: boolean;
  /** The ideas in the best order for that start (idea ids) */
  order: number[];
  /** The search finished (false: the time budget ended it early) */
  exact: boolean;
};

export function bestStartTime({
  activities,
  prefs,
  durationMinutes,
  currentMs,
  nowMs,
  days = 3,
  firstHour = 8,
  lastHour = 22,
  weatherAt = null,
  budgetMs = 1500,
}: Args): BestStart {
  if (activities.length === 0) return {startMs: currentMs, changed: false, order: [], exact: true};
  const deadline = Date.now() + budgetMs;

  const prefsAt = (startMs: number): UserPrefs => ({
    ...prefs,
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(startMs + durationMinutes * MINUTE).toISOString(),
  });
  const placed: PlacedActivity[] = activities.map((activity) => ({activity}));
  const indexOf = new Map(placed.map((p, i) => [p, i]));
  // Orders are laid out from here (the current start, on the 5 minutes)
  const refMs = Math.round(currentMs / STEP) * STEP;
  const ref = prefsAt(refMs);

  // The starts: every 5 minutes in the hours we start dates, not in the past
  const firstDay = new Date(currentMs);
  firstDay.setHours(0, 0, 0, 0);
  const starts: number[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + d);
    for (let m = firstHour * 60; m <= lastHour * 60; m += 5) {
      const ms = day.getTime() + m * MINUTE;
      if (ms >= nowMs + 15 * MINUTE && ms < firstDay.getTime() + days * DAY) starts.push(ms);
    }
  }
  const costOf = (ms: number) => (new Date(ms).getMinutes() % 15 === 0 ? 0 : OFF_QUARTER);
  const startCost = starts.map(costOf);

  // Each idea's clock penalty at a start, worked out once
  const cache = placed.map(() => new Map<number, number>());
  const clockAt = (i: number, ms: number) => {
    let penalty = cache[i].get(ms);
    if (penalty === undefined) {
      penalty = clockPenaltyAt(placed[i], ref, ms, weatherAt);
      cache[i].set(ms, penalty);
    }
    return penalty;
  };

  // The least each idea can pay at its best time, anywhere it could land
  // (from the earliest start to the latest, plus the whole date)
  const reach = placed.reduce((sum, p) => sum + stopMinutes(p) * MINUTE + DRIVE_ROOM, durationMinutes * MINUTE);
  const fromMs = Math.min(refMs, starts[0] ?? refMs);
  const toMs = Math.max(refMs, starts[starts.length - 1] ?? refMs) + reach;
  const floor = placed.reduce((sum, _, i) => sum + timeFloor(fromMs, toMs, (t) => clockAt(i, t)), 0);
  const ceiling = PERFECT_SCORE - floor;

  // Each order laid out once: its evaluation at refMs and each stop's offset
  const layouts = new Map<string, {evaluation: PlanEvaluation; offsets: number[]; ideas: number[]}>();
  const layoutOf = (order: PlacedActivity[]) => {
    const key = order.map((p) => indexOf.get(p)).join(",");
    let layout = layouts.get(key);
    if (!layout) {
      const timeline = deriveSequentialTimeline(order, ref);
      const evaluation = evaluatePlan(order, ref, timeline, {weatherAt});
      const slots = timeline.filter((slot) => slot.activity);
      layout = {
        evaluation,
        offsets: slots.map((slot) => slot.startTime - refMs),
        ideas: order.map((p) => indexOf.get(p)!),
      };
      layouts.set(key, layout);
    }
    return layout;
  };

  // 0. The best the current start can do (in any order): what a new time has
  // to beat. (The current start pays no cost: it's the one you have.)
  let current = -Infinity;
  let currentOrder = placed;
  searchOrders(
    placed,
    ref,
    (order) => {
      const score =
        refMs === currentMs
          ? layoutOf(order).evaluation.score
          : evaluatePlan(order, prefsAt(currentMs), undefined, {weatherAt}).score;
      if (score > current) {
        current = score;
        currentOrder = order;
      }
      return current;
    },
    -Infinity,
    {floor},
  );
  const idsOf = (order: PlacedActivity[]) => order.map((p) => p.activity.idea_id as number);
  if (current >= PERFECT_SCORE) return {startMs: currentMs, changed: false, order: idsOf(currentOrder), exact: true};

  let best = {startMs: currentMs, score: current};
  let bestOrder = currentOrder;
  const consider = (startMs: number, score: number, order: PlacedActivity[]) => {
    const closer = Math.abs(startMs - currentMs) < Math.abs(best.startMs - currentMs);
    if (score > best.score || (score === best.score && closer)) {
      best = {startMs, score};
      bestOrder = order;
    }
  };

  // 1. Every order that could win, at every start (skipped when nothing can
  // beat the current start at its lengths)
  let exact = true;
  if (current < ceiling) searchOrders(
    placed,
    ref,
    (order) => {
      const {evaluation, offsets, ideas} = layoutOf(order);
      // The part that doesn't depend on the clock
      const fixed = PERFECT_SCORE - (evaluation.penalties - clockPenalties(evaluation.issues));
      // Its best can't beat the best found: skip its starts
      if (Math.round(fixed - floor) < best.score) return -Infinity;
      let orderBest = -Infinity;
      for (let j = 0; j < starts.length; j++) {
        const startMs = starts[j];
        let clock = startCost[j];
        let beaten = false;
        for (let k = 0; k < ideas.length; k++) {
          clock += clockAt(ideas[k], startMs + offsets[k]);
          // Penalties only add up: already worse than the best, stop adding
          if (Math.round(fixed - clock) < best.score) {
            beaten = true;
            break;
          }
        }
        if (beaten) continue;
        const score = Math.round(fixed - clock);
        orderBest = Math.max(orderBest, score);
        consider(startMs, score, order);
      }
      return orderBest;
    },
    current,
    {
      floor,
      stop: () => {
        if (Date.now() <= deadline) return false;
        exact = false;
        return true;
      },
    },
  );

  // 2. Stretching flexible ideas, at the current start and near the best time
  // (the builder stretches the same way once you start planning)
  const stretched = (order: PlacedActivity[], ms: number) =>
    stretchToFit(order, prefsAt(ms), {weatherAt}).score;
  const atCurrent = stretched(currentOrder, currentMs);
  current = Math.max(current, atCurrent);
  consider(currentMs, atCurrent, currentOrder);
  const allowed = new Set(starts);
  const center = Math.round(best.startMs / (15 * MINUTE)) * 15 * MINUTE;
  const order = bestOrder;
  for (let ms = center - STRETCH_REACH; ms <= center + STRETCH_REACH; ms += 15 * MINUTE) {
    if (allowed.has(ms)) consider(ms, stretched(order, ms) - costOf(ms), order);
  }
  if (allowed.has(best.startMs)) consider(best.startMs, stretched(order, best.startMs) - costOf(best.startMs), order);

  const changed = best.score >= current + MIN_GAIN && best.startMs !== currentMs;
  return {
    startMs: changed ? best.startMs : currentMs,
    changed,
    order: idsOf(changed ? bestOrder : currentOrder),
    exact,
  };
}
