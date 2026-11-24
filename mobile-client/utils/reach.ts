// Which ideas are within reach. Go-out ideas happen at a place, so one in
// another city isn't an option; stay-in ideas happen at home, so they work
// anywhere (and keep Discover and the builder full outside the launch city).
import type {UserPrefs} from "@/src/store/usePrefsStore";
import {getDistance} from "./geo";
import {homeOf, stopLocation, type LatLng, type PlacedActivity} from "./timeline";

/** Go-out ideas farther than this from every center are someone else's city
 *  (Provo to Salt Lake City is about 45 mi) */
export const AREA_MILES = 60;

type Placeable = {
  modality?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * Stay-in ideas, go-out ideas without a place ("anywhere"), and go-out ideas
 * within AREA_MILES of any of the centers. With no center known there's
 * nothing to measure from, so everything is in reach.
 */
export const inReach = (idea: Placeable, centers: (LatLng | null | undefined)[]): boolean => {
  if (idea.modality === "STAY_IN") return true;
  if (idea.latitude == null || idea.longitude == null) return true;
  const known = centers.filter((center): center is LatLng => center != null);
  if (!known.length) return true;
  const at = {latitude: idea.latitude, longitude: idea.longitude};
  return known.some((center) => getDistance(center, at) <= AREA_MILES);
};

/** A date that gets this far from home is a trip: from then on, stops head home */
export const FAR_TRIP_MILES = 15;
/** How much farther from home a stop on a trip may be than its neighbors */
export const OUT_OF_THE_WAY_MILES = 1;

/**
 * On a trip (the start or a stop more than FAR_TRIP_MILES from home), whether
 * the stop at `index` of `plan` takes you farther from home than both its
 * neighbors (the start before the first stop, home after the last) by more
 * than OUT_OF_THE_WAY_MILES. Snowboarding at Nordic Valley from Provo: dinner
 * in Ogden on the way back is fine, a stop past the resort isn't.
 * `alsoAllowed`: places it may be as far as (the stop it's replacing).
 */
export const goesFartherFromHome = (
  plan: PlacedActivity[],
  index: number,
  prefs: UserPrefs,
  alsoAllowed: (LatLng | null)[] = [],
): boolean => {
  if (prefs.modality !== "GO_OUT" || !plan[index]) return false;
  const home = homeOf(prefs);
  const here = stopLocation(plan[index].activity, prefs);
  if (!home || !here) return false;
  const fromHome = (at: LatLng | null | undefined): number | null =>
    at ? getDistance(home, at) : null;
  const known = (values: (number | null)[]) => values.filter((v): v is number => v != null);

  const start = prefs.currentLocation ?? null;
  const elsewhere = plan.filter((_, i) => i !== index).map((p) => stopLocation(p.activity, prefs));
  const farthest = Math.max(0, ...known([start, ...elsewhere, ...alsoAllowed].map(fromHome)));
  if (farthest <= FAR_TRIP_MILES) return false;

  const before = index > 0 ? stopLocation(plan[index - 1].activity, prefs) : start;
  const after = index < plan.length - 1 ? stopLocation(plan[index + 1].activity, prefs) : home;
  const limits = known([before, after, ...alsoAllowed].map(fromHome));
  if (!limits.length) return false;
  return (fromHome(here) ?? 0) > Math.max(...limits) + OUT_OF_THE_WAY_MILES;
};
