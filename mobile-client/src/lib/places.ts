// src/lib/places.ts
// Places (public.venues) for the idea form (#78): search the ones on
// Venture, or describe a new one to add. The database only ever returns
// places you may see (#77), so nobody's private pins show up here.

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import type {LatLng} from "@/utils/timeline";

/** A place on Venture, from search_places() */
export type PlaceResult = {
  venue_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** From the search point (null when searching anywhere) */
  distance_m: number | null;
  /** Ideas there that you can see */
  ideas: number;
  /** You added it */
  added_by_me: boolean;
  access_note: string | null;
  /** Published ideas there (none: only you can see it, if you added it) */
  public_ideas: number;
};

/** What the idea form keeps: a place that exists, or one to add when it's saved */
export type PickedPlace =
  | {
      kind: "existing";
      venueId: string;
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
    }
  | {
      kind: "new";
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
      /** How to get there (optional) */
      accessNote: string | null;
    };

export const pickExisting = (p: PlaceResult): PickedPlace => ({
  kind: "existing",
  venueId: p.venue_id,
  name: p.name,
  address: p.address,
  latitude: p.latitude,
  longitude: p.longitude,
});

/** Places by name and / or near a point. Throws a readable Error. */
export async function searchPlaces({
  query,
  near,
  radiusM,
  limit = 20,
}: {
  query?: string | null;
  near?: LatLng | null;
  radiusM?: number;
  limit?: number;
}): Promise<PlaceResult[]> {
  const {data, error} = await supabase.rpc("search_places", {
    p_query: query?.trim() || null,
    p_lat: near?.latitude ?? null,
    p_lng: near?.longitude ?? null,
    p_radius_m: radiusM ?? 80_000,
    p_limit: limit,
  });
  if (error) throw new Error(friendlyError(error));
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    ideas: Number(r.ideas) || 0,
    public_ideas: Number(r.public_ideas) || 0,
  }));
}

/**
 * Places that might be the same as a new one: anything very close, or with
 * a similar name a little further away (for "Is it one of these?").
 */
export async function similarPlacesNear(name: string, at: LatLng): Promise<PlaceResult[]> {
  const [close, named] = await Promise.all([
    searchPlaces({near: at, radiusM: 120, limit: 5}),
    name.trim() ? searchPlaces({query: name, near: at, radiusM: 800, limit: 5}) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  return [...named, ...close].filter((p) => !seen.has(p.venue_id) && !!seen.add(p.venue_id)).slice(0, 5);
}

/** "350 ft" / "0.4 mi" / "12 mi" */
export function distanceLabel(meters: number | null): string | null {
  if (meters == null) return null;
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.max(10, Math.round((meters * 3.281) / 10) * 10)} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** Add a new place (when the idea is saved); returns its id. Throws a readable Error. */
export async function addPlace(place: Extract<PickedPlace, {kind: "new"}>): Promise<string> {
  const {data, error} = await supabase
    .from("venues")
    .insert({
      name: place.name.trim(),
      address: place.address,
      coordinates: `POINT(${place.longitude} ${place.latitude})`,
      access_note: place.accessNote?.trim() || null,
    })
    .select("venue_id")
    .single();
  if (error) throw new Error(friendlyError(error));
  return data.venue_id as string;
}
