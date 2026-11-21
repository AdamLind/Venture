// utils/vibes.ts
// How well an idea fits the vibes picked on Plan (#20). Pure.
//
// What was asked for: each tile tapped whole is one request ("something
// food"), met by any of its tags or by what the group is about, from the
// idea's fields (so an idea counts even without that group's tags):
//   Food ..... a meal or a treat
//   Active ... at least a little physical
//   Close .... calm and close
//   (Shows is its tags only.)
// Each tag picked on its own is one request, met by that tag.
//
// The fit is cosine similarity, the usual way search compares two sets of
// terms: requests met ÷ √(the idea's tags). Meeting more of what was asked
// ranks higher; a tag nobody asked for dilutes it a little. So a tag only
// pays off in the searches that want it, and padding an idea with tags
// never ranks it above one tagged accurately. Ties are left to the rest of
// the ranking (distance, budget, fit in the plan), never to tag count.

import {TAG_TAXONOMY} from "@/src/constants/tags";
import {exertionOf, feelOf} from "./ideaTraits";

const GROUP_FIELDS: Record<string, (item: any) => boolean> = {
  Food: (item) => item?.activity_type === "MEAL" || item?.activity_type === "TREAT",
  Active: (item) => exertionOf(item) !== "NONE",
  Close: (item) => feelOf(item) === "CALM",
};

/** The groups picked whole (every tag in the vibes: the tile was tapped) */
export const wholeGroups = (vibes: string[]) =>
  Object.keys(TAG_TAXONOMY).filter((group) => TAG_TAXONOMY[group].every((tag) => vibes.includes(tag)));

/** How many of the requests an idea meets (whole groups once each, single tags each) */
export function requestsMet(item: any, vibes: string[] | null | undefined): number {
  if (!vibes?.length) return 0;
  const tags: string[] = Array.isArray(item?.tags) ? item.tags : [];
  const whole = wholeGroups(vibes);
  const inWhole = new Set(whole.flatMap((group) => TAG_TAXONOMY[group]));
  let met = 0;
  for (const group of whole) {
    const hasGroupTag = tags.some((tag) => TAG_TAXONOMY[group].includes(tag));
    if (hasGroupTag || GROUP_FIELDS[group]?.(item)) met += 1;
  }
  for (const vibe of vibes) {
    if (!inWhole.has(vibe) && tags.includes(vibe)) met += 1;
  }
  return met;
}

/** How well an idea fits the vibes: requests met ÷ √(its tags); 0 when nothing was asked */
export function vibeFit(item: any, vibes: string[] | null | undefined): number {
  const met = requestsMet(item, vibes);
  if (met === 0) return 0;
  const tagCount = Array.isArray(item?.tags) ? item.tags.length : 0;
  return met / Math.sqrt(Math.max(1, tagCount));
}

/** The vibes ask for food (any Food tag) */
export const wantsFood = (vibes: string[] | null | undefined) =>
  !!vibes?.some((vibe) => TAG_TAXONOMY.Food.includes(vibe));
