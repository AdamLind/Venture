// types/dates.ts
// Saved dates (public.itineraries + public.itinerary_activities) as the app uses them.

import type {ScoredActivity} from "@/types/itinerary";
import type {UserPrefs} from "@/src/store/usePrefsStore";

export type ItineraryStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

/** An activity row joined onto a stop, with venue coordinates decoded. */
export type StopActivity = ScoredActivity & {
  latitude: number | null;
  longitude: number | null;
  venues?: {name: string; address: string | null} | null;
};

export interface ItineraryStop {
  stop_id: number;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  /** null when the activity was deleted or is no longer visible to you */
  activity: StopActivity | null;
}

export interface Itinerary {
  itinerary_id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  status: ItineraryStatus;
  /** The planning prefs used to build it; lets us rebuild the full timeline. */
  prefs_snapshot: UserPrefs | null;
  created_at: string | null;
  stops: ItineraryStop[];
}

export interface NewItinerary {
  title: string;
  startsAt: Date;
  endsAt: Date;
  stops: {activity_id: number; starts_at: string; ends_at: string}[];
  prefsSnapshot: UserPrefs;
}
