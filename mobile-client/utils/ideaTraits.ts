// utils/ideaTraits.ts
// How an idea feels and how physical it is (#20): two separate questions
// the publisher asks, read by the planner. Pure.
//
//   feel ...... CALM (quiet, close: stargazing, a spa) or UPBEAT (engaging,
//               playful: an escape room, karaoke, a show)
//   exertion .. NONE (a movie, a meal), LIGHT (a stroll, a picnic walk),
//               HARD (climbing, a hike, a dance class: a workout)
//
// Kept apart because they vary apart: stargazing is calm and a little
// physical, climbing upbeat and a workout, an escape room upbeat and not
// physical at all.
//
// Ideas posted before these were asked get what the old fields said: the
// Active type (or Strenuous) was a workout, everything else wasn't; feel is
// guessed from the tags only when they clearly say calm, else unknown.

export type Feel = "CALM" | "UPBEAT";
export type Exertion = "NONE" | "LIGHT" | "HARD";

/** Tags that clearly mean calm and close (src/constants/tags.ts); games can be cozy or upbeat */
const CALM_TAGS = ["intimate", "quiet", "spa", "views"];
const PLAYFUL_TAGS = ["games"];

/** How it feels, or null if unknown (no arc rule for it) */
export function feelOf(activity: any): Feel | null {
  if (activity?.feel === "CALM" || activity?.feel === "UPBEAT") return activity.feel;
  const tags: string[] = Array.isArray(activity?.tags) ? activity.tags : [];
  if (tags.some((t) => CALM_TAGS.includes(t)) && !tags.some((t) => PLAYFUL_TAGS.includes(t))) return "CALM";
  return null;
}

/** How physical it is */
export function exertionOf(activity: any): Exertion {
  if (activity?.exertion === "NONE" || activity?.exertion === "LIGHT" || activity?.exertion === "HARD") {
    return activity.exertion;
  }
  const risks: string[] = Array.isArray(activity?.risk_labels) ? activity.risk_labels : [];
  if (activity?.activity_type === "ACTIVE" || risks.includes("STRENUOUS")) return "HARD";
  return "NONE";
}

/** A workout: two in a row, straight after a meal, or when worn out are problems */
export const isWorkout = (activity: any) => exertionOf(activity) === "HARD";
