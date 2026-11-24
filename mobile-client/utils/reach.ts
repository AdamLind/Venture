// Which ideas are within reach. Go-out ideas happen at a place, so one in
// another city isn't an option; stay-in ideas happen at home, so they work
// anywhere (and keep Discover and the builder full outside the launch city).
import {getDistance} from "./geo";
import type {LatLng} from "./timeline";

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
