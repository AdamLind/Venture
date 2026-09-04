// types/activities.ts

export interface SimpleLocation {
  latitude: number;
  longitude: number;
}

// ─── DATABASE TABLE MODELS ───

export interface Venue {
  venue_id: string; // UUID
  name: string;
  address: string | null;
  coordinates: string; // From PostGIS POINT()
  apple_place_id?: string | null; // For later Maps API integration
  hours_last_updated?: string | null;
  is_permanently_closed?: boolean;
}

export interface BaseActivity {
  // ─── CORE IDENTITY ───
  idea_id: number;
  user_id: string | null; // UUID from Auth
  venue_id: string | null; // UUID foreign key
  title: string;
  description: string;
  image_urls: string[] | null; // DB is an array of text
  url: string | null;

  // ─── CATEGORIZATION ───
  modality: "STAY_IN" | "GO_OUT";
  activity_type: "MEAL" | "TREAT" | "ACTIVE" | "OTHER";
  environment: "INDOOR" | "OUTDOOR" | "MIXED";

  // ─── LOGISTICS & TIME ───
  est_price_per_person: number;
  est_duration_minutes: number;
  is_duration_variable: boolean;
  time_of_day:
    | ("EARLY_MORNING" | "MORNING" | "AFTERNOON" | "EVENING" | "LATE_NIGHT")[]
    | null;

  // ─── CONSTRAINTS ───
  min_people: number;
  max_people: number;
  min_age: number;

  // ─── SYSTEM & METADATA ───
  created_at: string;
  visibility:
    | "PRIVATE"
    | "PENDING_REVIEW"
    | "PUBLISHED"
    | "REJECTED"
    | "NEEDS_REVISION";
  moderation_note: string | null;

  // ─── RELATIONAL DATA (Populated via Supabase Joins) ───
  tags?: string[]; // Flattened from activity_tags table
  venue?: Venue | null; // Joined from venues table
}

// ─── ALGORITHM & ITINERARY MODELS ───

export interface ScoredActivity extends BaseActivity {
  distance: number;
  score: number;
}

export interface BuilderActivity extends ScoredActivity {
  fitStatus: "FITS_NOW" | "NO_FIT";
  travelMins: number;
}

export type SlotType = "AVAILABLE" | "OCCUPIED" | "BUFFER";

export interface TimeSlot {
  id: string;
  title: string;
  startTime: number; // Minutes from start of day (e.g., 540 for 9:00 AM)
  endTime: number;
  type: SlotType;
  activity?: ScoredActivity | null;
}

export type PlanningStep = "ANCHOR" | "SUB_ANCHOR" | "FILLER" | "COMPLETE";
