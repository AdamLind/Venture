// utils/editDate.ts
// Editing a saved date (#36): replace a stop or remove one, using the same
// rules as the builder and the prefs the date was planned with (budget,
// time window, start place, vibes). Pure: no database or stores.
//
//   - checkEdit: the date laid out again after a change, its problems, and
//     a reorder that fixes them (if one does)
//   - rankReplacements: alternatives for one stop, tried in its place
//
// Saving is the itinerary store's editStops.

import type {UserPrefs} from "@/src/store/usePrefsStore";
import type {ScoredActivity, TimeSlot} from "@/types/itinerary";
import {preferenceScore} from "@/utils/itineraryEngine";
import {type PlanEvaluation, type PlanIssue, evaluatePlan, warningsByStop} from "@/utils/planEvaluator";
import {type SmartOrderResult, smartOrder} from "@/utils/smartOrder";
import {type PlacedActivity, deriveSequentialTimeline, stopMinutes} from "@/utils/timeline";

export type EditCheck = {
  placed: PlacedActivity[];
  timeline: TimeSlot[];
  evaluation: PlanEvaluation;
  /** The serious ones (a stop that's closed, the date running late, …) */
  problems: PlanIssue[];
  /** A better order that fixes some of them, if there is one */
  reorder: SmartOrderResult | null;
};

/** When a laid-out date ends (its last busy slot, the trip home included) */
export const endOfTimeline = (timeline: TimeSlot[]) =>
  timeline.filter((slot) => slot.type === "OCCUPIED").reduce((end, slot) => Math.max(end, slot.endTime), 0);

/** The date after a change: laid out again, checked, and a fix if a reorder has one */
export function checkEdit(placed: PlacedActivity[], prefs: UserPrefs): EditCheck {
  const timeline = deriveSequentialTimeline(placed, prefs);
  const evaluation = evaluatePlan(placed, prefs, timeline);
  const problems = evaluation.issues.filter((issue) => issue.severity === "hard");
  let reorder: SmartOrderResult | null = null;
  if (placed.length > 1 && evaluation.issues.length) {
    const result = smartOrder(placed, prefs);
    if (result.improved && result.fixed.length) reorder = result;
  }
  return {placed, timeline, evaluation, problems, reorder};
}

/** The cost of a stop for everyone going */
const costOf = (activity: any, prefs: UserPrefs) =>
  (Number(activity?.est_price_per_person) || 0) * (Number(prefs.headCount) || 1);

export type Replacement = ScoredActivity & {
  /** FITS: on time and in budget; otherwise why not */
  fit: "FITS" | "TOO_LONG" | "OVER_BUDGET" | "CLOSED";
  /** What it costs everyone */
  totalCost: number;
  /** A problem it brings in that spot (the builder's stop warning) */
  problem: PlanIssue | null;
  rank: number;
};

/**
 * Alternatives for the stop at `index`: each tried in its place, ranked like
 * the builder's suggestions (how the whole date scores with it, plus how
 * well it matches the plan's vibes). What fits comes first.
 */
export function rankReplacements(
  candidates: ScoredActivity[],
  placed: PlacedActivity[],
  index: number,
  prefs: UserPrefs,
): Replacement[] {
  const others = placed.filter((_, i) => i !== index);
  const onDate = new Set(placed.map((p) => p.activity.idea_id));
  const budget = Number(prefs.budget) || 0;
  const othersCost = others.reduce((sum, p) => sum + costOf(p.activity, prefs), 0);
  const baseline = evaluatePlan(others, prefs).score;

  return candidates
    .filter((c) => !onDate.has(c.idea_id))
    .map((candidate) => {
      const next = [...placed];
      next[index] = {activity: candidate};
      const timeline = deriveSequentialTimeline(next, prefs);
      const evaluation = evaluatePlan(next, prefs, timeline);
      const totalCost = costOf(candidate, prefs);
      const late = evaluation.issues.some((issue) => issue.kind === "PAST_END");
      const closed = evaluation.issues.some(
        (issue) => issue.kind === "CLOSED" && issue.stopId === candidate.idea_id,
      );
      const fit: Replacement["fit"] = late
        ? "TOO_LONG"
        : budget > 0 && othersCost + totalCost > budget
          ? "OVER_BUDGET"
          : closed
            ? "CLOSED"
            : "FITS";
      return {
        ...candidate,
        fit,
        totalCost,
        problem: warningsByStop(evaluation).get(candidate.idea_id) ?? null,
        rank: evaluation.score - baseline + preferenceScore(candidate, prefs, 0),
      };
    })
    .sort((a, b) => {
      if (a.fit !== b.fit) return a.fit === "FITS" ? -1 : b.fit === "FITS" ? 1 : 0;
      return b.rank - a.rank;
    });
}

/** A date that'd overlap this one (same person's dates), for "runs into Lake day" */
export type OtherDate = {itinerary_id: number; title: string; starts_at: string; ends_at: string; status: string};

/** The first of `others` that overlaps start–end (not this date, not finished or cancelled) */
export function clashWith(
  selfId: number,
  startMs: number,
  endMs: number,
  others: OtherDate[],
): OtherDate | null {
  return (
    others
      .filter((d) => d.itinerary_id !== selfId && (d.status === "PLANNED" || d.status === "ACTIVE"))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .find((d) => new Date(d.starts_at).getTime() < endMs && new Date(d.ends_at).getTime() > startMs) ?? null
  );
}

/** "Runs into Lake day (starts 7:30 PM)" */
export function clashMessage(other: OtherDate) {
  const at = new Date(other.starts_at).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
  return `Runs into ${other.title} (starts ${at})`;
}

/** When a laid-out date starts (its first busy slot) */
export const startOfTimeline = (timeline: TimeSlot[]) =>
  timeline.filter((slot) => slot.type === "OCCUPIED").reduce((start, slot) => Math.min(start, slot.startTime), Infinity);

/** How much time (minutes) a stop at `index` could take without the date running late */
export function roomAt(placed: PlacedActivity[], index: number, prefs: UserPrefs): number {
  const timeline = deriveSequentialTimeline(placed, prefs);
  const end = new Date(prefs.endDate).getTime();
  const spare = Math.max(0, (end - endOfTimeline(timeline)) / 60_000);
  return stopMinutes(placed[index]) + spare;
}
