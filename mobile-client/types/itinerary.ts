export interface SimpleLocation {
  latitude: number;
  longitude: number;
}

export interface BaseActivity {
  // ─── CORE IDENTITY ───
  idea_id: number;
  title: string;
  description: string;
  image_url: string | null; // NEW: For beautiful UI cards
  url: string | null; // NEW: Link to website/tickets

  // ─── CATEGORIZATION ───
  modality: "STAY_IN" | "GO_OUT";
  activity_type: "MEAL" | "TREAT" | "ACTIVE" | "OTHER";
  environment: "INDOOR" | "OUTDOOR" | "MIXED"; // NEW: Weather routing
  tags: string[];

  // AVAILABLE TAGS
  // 1. 🍔 Food (MEAL) [casual, upscale, sweets, soda, cafes]
  // 2. 🏀 Active (ACTIVE) [nature, stroll, games, sweat, seasonal]
  // 3. 🎟️ Shows (ENTERTAINMENT) [film, music, comedy, stage, arts]
  // 4. ☕ Close/Cozy [intimate, quiet, create, views, spa]

  // ─── LOGISTICS & TIME ───
  est_price_per_person: number; // (Highly recommend keeping this strictly as a number for easier DB math)
  est_duration_minutes: number;
  is_duration_variable: boolean;
  time_of_day: ("MORNING" | "AFTERNOON" | "EVENING" | "LATE_NIGHT")[]; // NEW: Scheduling bounds

  // ─── CONSTRAINTS ───
  min_people: number;
  max_people: number;
  min_age: number; // NEW: e.g., 18 for skydiving, 0 for parks

  // ─── LOCATION ───
  location_name: string | null;
  address: string | null; // NEW: Human readable
  place_id: string | null; // NEW: For Maps API integrations
  latitude: number | null;
  longitude: number | null;

  // ─── METADATA ───
  created_at: string;
  user_id: number | null; // null if it's a global/app-provided idea
  visibility: "PRIVATE" | "PENDING" | "PUBLISHED";
}

export interface ScoredActivity extends BaseActivity {
  distance: number; // Notice there is no "?". Once it's scored, it MUST have a distance.
  score: number;
}

export interface BuilderActivity extends ScoredActivity {
  fitStatus: "FITS_NOW" | "NO_FIT";
  travelMins: number;
}


export enum ActivityLocation {
  StayIn = "STAY_IN",
  GoOut = "GO_OUT",
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
