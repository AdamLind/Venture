// types/dates.ts
// Saved dates (public.itineraries + public.itinerary_activities) as the app uses them.

import type {ScoredActivity} from "@/types/itinerary";
import type {UserPrefs} from "@/src/store/usePrefsStore";

export type ItineraryStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

/** Your part in a shared date (#36): the owner, or invited to edit, comment or view */
export type DateRole = "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER";
export type InviteStatus = "PENDING" | "ACCEPTED" | "DECLINED";

/** Someone on a date, as the date list knows them (usernames only) */
export interface DatePerson {
  user_id: string;
  username: string | null;
  profile_image_url: string | null;
  role: DateRole;
  invite_status: InviteStatus;
}

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
  /** Who made it */
  created_by: string | null;
  /** Your role on it, and whether you've said yes (null: not on it) */
  my_role: DateRole | null;
  my_status: InviteStatus | null;
  /** Everyone else on it (not declined) */
  people: DatePerson[];
  comment_count: number;
}

export interface NewItinerary {
  title: string;
  startsAt: Date;
  endsAt: Date;
  stops: {activity_id: number; starts_at: string; ends_at: string}[];
  prefsSnapshot: UserPrefs;
}
