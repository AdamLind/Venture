// utils/planEvaluator.ts
// Judges a whole plan: given an order of stops, how good is it, and what's
// wrong with it? It never changes the plan. Smart features ask it about
// options and keep the best: smart reorder (#56), suggestions between stops
// (#59), mid-date detours and reordering (#62, #63: evaluate the stops left,
// starting now, from where you are).
//
//   1. Timeline ...... times and travel legs (deriveSequentialTimeline)
//   2. Walk the day .. how full / tired you are at each stop's start
//   3. Rules ......... small independent checks, each with a penalty
//                      (weather rules live in src/lib/weatherRules.ts; pass
//                      `weatherAt` to use them, else weather is ignored)
//   4. Score ......... 100 - penalties - backtracking
//
// Hard problems mean "you don't want this" (reorder can skip those orders
// early); soft ones mean "could be better". Tune everything in PENALTY and
// LIMITS below.

import type {TimeSlot} from "@/types/itinerary";
import type {UserPrefs} from "@/src/store/usePrefsStore";
import {bestTimeLabel, isGoodTime, normalizeTimeOfDay} from "@/src/lib/timeOfDay";
import {
  type LatLng,
  type PlacedActivity,
  deriveSequentialTimeline,
  evaluateContextAt,
  formatTime,
  homeOf,
  isOpenEnded,
  safeGetDistance,
  stopLocation,
} from "./timeline";
import {sunsetAt} from "./sunset";
import {type WeatherLookup, weatherProblems} from "@/src/lib/weatherRules";

// ─── Tuning ────────────────────────────────────────────────────────────────────

export const PENALTY = {
  backToBackMeals: 60, // hard
  backToBackActive: 50, // hard
  pastEndPer15Min: 10, // hard, per 15 minutes (or part) past the end
  stillFull: 30,
  offHours: 30,
  wornOut: 25,
  afterDark: 25,
  activeAfterMeal: 20,
  oddMealTime: 15,
  // Avoidable travel: miles beyond the shortest route through the same stops.
  // Capped below the hard rules, so saving miles never justifies, say, two
  // dinners in a row.
  backtrackPerMile: 4,
  backtrackMax: 40,
};

export const LIMITS = {
  shortActiveMinutes: 45, // two active stops in a row are OK if both are this short
  fullSatiation: 70, // above this you're still full
  wornOutExhaustion: 60, // above this you're worn out
  darkGraceMinutes: 15, // ending this soon after sunset is fine
  // When backtracking is worth a warning (it's always in the score)
  backtrackWarnMiles: 3,
  backtrackWarnShare: 0.25, // ...or this share of the whole route
  backtrackMinMiles: 1, // never warn below this
  exactRouteStops: 8, // above this, the shortest route is estimated
};

/** Hours (local) when a meal is unremarkable. */
const MEAL_WINDOWS = [
  {from: 7, to: 10.5},
  {from: 11, to: 14.5},
  {from: 17, to: 21.5},
];

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PlanIssueKind =
  | "BACK_TO_BACK_MEALS"
  | "BACK_TO_BACK_ACTIVE"
  | "PAST_END"
  | "STILL_FULL"
  | "OFF_HOURS"
  | "WORN_OUT"
  | "AFTER_DARK"
  | "ACTIVE_AFTER_MEAL"
  | "ODD_MEAL_TIME"
  | "BACKTRACK"
  // Weather (src/lib/weatherRules.ts)
  | "TOO_COLD"
  | "TOO_HOT"
  | "RAIN"
  | "WIND"
  | "NO_SNOW";

export type PlanIssue = {
  kind: PlanIssueKind;
  severity: "hard" | "soft";
  /** The stop to show it on (null: about the whole plan) */
  stopId: number | null;
  /** Other stops involved (e.g. the meal before) */
  relatedIds: number[];
  message: string;
  penalty: number;
};

export type PlanEvaluation = {
  score: number;
  /** Most serious first */
  issues: PlanIssue[];
  timeline: TimeSlot[];
  routeMiles: number;
  /** Miles beyond the shortest route through the same stops */
  backtrackMiles: number;
};

// ─── Route distance and backtracking ──────────────────────────────────────────

const routeLength = (points: LatLng[]) => {
  let miles = 0;
  for (let i = 1; i < points.length; i++) miles += safeGetDistance(points[i - 1], points[i]);
  return miles;
};

/**
 * The shortest route from `start` through every stop to `end`. Exact (every
 * order, pruned as soon as a partial route is already longer than the best)
 * up to LIMITS.exactRouteStops; beyond that, nearest stop first, then keep
 * any swap that shortens it.
 */
export function shortestRouteMiles(start: LatLng, stops: LatLng[], end: LatLng): number {
  const n = stops.length;
  if (n === 0) return safeGetDistance(start, end);

  // Distances once: index n = start, n + 1 = end
  const at = (i: number) => (i === n ? start : i === n + 1 ? end : stops[i]);
  const d: number[][] = [];
  for (let i = 0; i < n + 2; i++) {
    d[i] = [];
    for (let j = 0; j < n + 2; j++) d[i][j] = safeGetDistance(at(i), at(j));
  }

  if (n <= LIMITS.exactRouteStops) {
    let best = Infinity;
    const used = new Array(n).fill(false);
    const walk = (from: number, count: number, sofar: number) => {
      if (sofar >= best) return;
      if (count === n) {
        best = Math.min(best, sofar + d[from][n + 1]);
        return;
      }
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        used[i] = true;
        walk(i, count + 1, sofar + d[from][i]);
        used[i] = false;
      }
    };
    walk(n, 0, 0);
    return best;
  }

  // Nearest first...
  const order: number[] = [];
  const left = new Set(Array.from({length: n}, (_, i) => i));
  let from = n;
  while (left.size) {
    let next = -1;
    for (const i of left) if (next === -1 || d[from][i] < d[from][next]) next = i;
    order.push(next);
    left.delete(next);
    from = next;
  }
  const length = (o: number[]) =>
    o.reduce((sum, i, k) => sum + d[k === 0 ? n : o[k - 1]][i], 0) + d[o[o.length - 1]][n + 1];
  // ...then keep any swap that helps
  let bestLength = length(order);
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        [order[i], order[j]] = [order[j], order[i]];
        const l = length(order);
        if (l < bestLength - 1e-9) {
          bestLength = l;
          improved = true;
        } else {
          [order[i], order[j]] = [order[j], order[i]];
        }
      }
    }
  }
  return bestLength;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const minutesBetween = (a: number, b: number) => Math.round((b - a) / 60_000);

const formatMinutes = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
};

const hourOf = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60;
};

const SEVERITY_ORDER = {hard: 0, soft: 1};

// ─── The evaluator ─────────────────────────────────────────────────────────────

/**
 * Scores an order of stops. Pass `timeline` if you already derived it for
 * the same `placed` and `prefs` (the builder does), and `weatherAt` to
 * include the weather.
 */
export function evaluatePlan(
  placed: PlacedActivity[],
  prefs: UserPrefs,
  timeline: TimeSlot[] = deriveSequentialTimeline(placed, prefs),
  options: {weatherAt?: WeatherLookup | null} = {},
): PlanEvaluation {
  const issues: PlanIssue[] = [];
  const stops = timeline.filter((slot) => slot.activity);
  const idOf = (slot: TimeSlot) => slot.activity!.idea_id as number;
  const add = (issue: Omit<PlanIssue, "relatedIds"> & {relatedIds?: number[]}) =>
    issues.push({relatedIds: [], ...issue});

  // ── Per-stop rules ──
  stops.forEach((slot, i) => {
    const activity: any = slot.activity!;
    const prev: any = i > 0 ? stops[i - 1].activity : null;
    const id = idOf(slot);
    const type = activity.activity_type;
    const minutes = minutesBetween(slot.startTime, slot.endTime);
    const context = evaluateContextAt(timeline, slot.startTime);

    // Meals
    if (type === "MEAL") {
      if (prev?.activity_type === "MEAL") {
        add({
          kind: "BACK_TO_BACK_MEALS",
          severity: "hard",
          stopId: id,
          relatedIds: [idOf(stops[i - 1])],
          message: "Right after another meal",
          penalty: PENALTY.backToBackMeals,
        });
      } else if (context.satiation > LIMITS.fullSatiation) {
        add({
          kind: "STILL_FULL",
          severity: "soft",
          stopId: id,
          message: "You'll still be full",
          penalty: PENALTY.stillFull,
        });
      }

      // An odd hour, unless the idea itself says this is its time (late-night diners)
      const ownTime =
        normalizeTimeOfDay(activity.time_of_day).length > 0 &&
        isGoodTime(activity.time_of_day, new Date(slot.startTime));
      const hour = hourOf(slot.startTime);
      if (!ownTime && !MEAL_WINDOWS.some((w) => hour >= w.from && hour < w.to)) {
        add({
          kind: "ODD_MEAL_TIME",
          severity: "soft",
          stopId: id,
          message: `Odd time for a meal (${formatTime(slot.startTime)})`,
          penalty: PENALTY.oddMealTime,
        });
      }
    }

    // Active stops
    if (type === "ACTIVE") {
      const prevMinutes = i > 0 ? minutesBetween(stops[i - 1].startTime, stops[i - 1].endTime) : 0;
      const bothShort =
        minutes <= LIMITS.shortActiveMinutes && prevMinutes <= LIMITS.shortActiveMinutes;
      if (prev?.activity_type === "ACTIVE" && !bothShort) {
        add({
          kind: "BACK_TO_BACK_ACTIVE",
          severity: "hard",
          stopId: id,
          relatedIds: [idOf(stops[i - 1])],
          message: "Two active stops in a row",
          penalty: PENALTY.backToBackActive,
        });
      } else if (context.exhaustion > LIMITS.wornOutExhaustion) {
        add({
          kind: "WORN_OUT",
          severity: "soft",
          stopId: id,
          message: "You'll be worn out by then",
          penalty: PENALTY.wornOut,
        });
      }
      if (prev?.activity_type === "MEAL") {
        add({
          kind: "ACTIVE_AFTER_MEAL",
          severity: "soft",
          stopId: id,
          relatedIds: [idOf(stops[i - 1])],
          message: "Hard to be active right after eating",
          penalty: PENALTY.activeAfterMeal,
        });
      }
    }

    // Time of day
    const offHours = !isGoodTime(activity.time_of_day, new Date(slot.startTime));
    if (offHours) {
      add({
        kind: "OFF_HOURS",
        severity: "soft",
        stopId: id,
        message: bestTimeLabel(activity.time_of_day) ?? "Not its best time",
        penalty: PENALTY.offHours,
      });
    }

    // Outside after dark (not for ideas meant for the evening or night)
    const windows = normalizeTimeOfDay(activity.time_of_day);
    const meantForDark = windows.includes("EVENING") || windows.includes("LATE_NIGHT");
    const place = stopLocation(activity, prefs);
    if (!offHours && activity.environment === "OUTDOOR" && !meantForDark && place) {
      const sunset = sunsetAt(new Date(slot.startTime), place.latitude, place.longitude);
      if (sunset && slot.endTime > sunset.getTime() + LIMITS.darkGraceMinutes * 60_000) {
        add({
          kind: "AFTER_DARK",
          severity: "soft",
          stopId: id,
          message: `Sunset is ${formatTime(sunset.getTime())}`,
          penalty: PENALTY.afterDark,
        });
      }
    }

    // Weather: too cold / hot, rain, wind, no snow (for what the idea needs)
    for (const problem of weatherProblems(activity, slot.startTime, slot.endTime, options.weatherAt)) {
      add({...problem, stopId: id});
    }
  });

  // ── Running past the end time ──
  if (!isOpenEnded(prefs) && stops.length) {
    const lastBusyEnd = timeline
      .filter((slot) => slot.type === "OCCUPIED")
      .reduce((end, slot) => Math.max(end, slot.endTime), 0);
    const over = minutesBetween(new Date(prefs.endDate).getTime(), lastBusyEnd);
    if (over > 0) {
      add({
        kind: "PAST_END",
        severity: "hard",
        stopId: null,
        message: `Runs ${formatMinutes(over)} past ${formatTime(new Date(prefs.endDate).getTime())}`,
        penalty: Math.ceil(over / 15) * PENALTY.pastEndPer15Min,
      });
    }
  }

  // ── Backtracking (go-out plans: start -> stops -> home) ──
  let routeMiles = 0;
  let backtrackMiles = 0;
  let backtrackPenalty = 0;
  const start = prefs.currentLocation;
  const home = homeOf(prefs);
  if (prefs.modality === "GO_OUT" && start && home && stops.length > 1) {
    const points = stops
      .map((slot) => stopLocation(slot.activity, prefs))
      .filter((p): p is LatLng => !!p);
    routeMiles = routeLength([start, ...points, home]);
    backtrackMiles = Math.max(0, routeMiles - shortestRouteMiles(start, points, home));
    backtrackPenalty = Math.min(PENALTY.backtrackMax, backtrackMiles * PENALTY.backtrackPerMile);
    const worthSaying =
      backtrackMiles >= LIMITS.backtrackMinMiles &&
      (backtrackMiles >= LIMITS.backtrackWarnMiles ||
        backtrackMiles / Math.max(routeMiles, 0.1) >= LIMITS.backtrackWarnShare);
    if (worthSaying) {
      add({
        kind: "BACKTRACK",
        severity: "soft",
        stopId: null,
        message: `This order backtracks ${backtrackMiles.toFixed(1)} mi`,
        penalty: backtrackPenalty,
      });
    }
  }

  // ── Score ──
  const rulePenalties = issues
    .filter((issue) => issue.kind !== "BACKTRACK")
    .reduce((sum, issue) => sum + issue.penalty, 0);
  const score = Math.round(100 - rulePenalties - backtrackPenalty);

  issues.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.penalty - a.penalty,
  );
  return {score, issues, timeline, routeMiles, backtrackMiles};
}

/** The most serious issue per stop, for showing one line on each stop card. */
export function warningsByStop(evaluation: PlanEvaluation): Map<number, PlanIssue> {
  const map = new Map<number, PlanIssue>();
  for (const issue of evaluation.issues) {
    if (issue.stopId != null && !map.has(issue.stopId)) map.set(issue.stopId, issue);
  }
  return map;
}
