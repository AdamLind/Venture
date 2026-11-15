// types/profile.ts
// Mirrors public.users and public.user_preferences in Supabase.

export type Modality = "STAY_IN" | "GO_OUT";

/** public.users: identity other people can see (name, username, avatar). */
export interface UserProfile {
  user_id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  created_at: string | null;
}

/** public.user_preferences: private to the signed-in user. */
export interface UserPreferences {
  user_id: string;
  birthdate: string | null; // "YYYY-MM-DD"; locked once set
  profile_code: string; // used for QR / profile link later
  home_label: string | null;
  home_lat: number | null;
  home_lng: number | null;
  default_budget: number;
  default_travel_miles: number;
  default_modality: Modality;
  default_head_count: number;
  vibes: string[];
  dietary: string[];
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What other people can see of a user (an idea's creator, someone on your date). */
export type PublicProfile = Pick<
  UserProfile,
  "username" | "first_name" | "last_name" | "profile_image_url"
>;

/** Columns the app is allowed to update on public.users. */
export type ProfileUpdate = Partial<
  Pick<UserProfile, "username" | "first_name" | "last_name" | "profile_image_url">
>;

/** Columns the app is allowed to update on public.user_preferences. */
export type PreferencesUpdate = Partial<
  Pick<
    UserPreferences,
    | "birthdate"
    | "home_label"
    | "home_lat"
    | "home_lng"
    | "default_budget"
    | "default_travel_miles"
    | "default_modality"
    | "default_head_count"
    | "vibes"
    | "dietary"
    | "onboarded_at"
  >
>;

/** The subset edited on the planning-defaults form (onboarding + settings). */
export type PlanningDefaults = Pick<
  UserPreferences,
  | "default_modality"
  | "default_budget"
  | "default_travel_miles"
  | "home_label"
  | "home_lat"
  | "home_lng"
>;
