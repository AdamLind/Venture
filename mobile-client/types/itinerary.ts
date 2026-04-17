export interface SimpleLocation {
  latitude: number;
  longitude: number;
}

export interface Activity {
  idea_id: number;
  title: string;
  description: string;
  modality: "STAY_IN" | "GO_OUT";
  activity_type: "MEAL" | "ACTIVE" | "RELAX"; // Crucial for "Social Gravity"
  tags: string[]; // For vibe matching (e.g., ["romantic", "cozy", "loud"])

  est_price_per_person: string | number;
  est_duration_minutes: number;

  // Location info (Optional for Stay In)
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;

  // Constraints
  min_people: number;
  max_people: number;

  // Scoring & Metadata
  score?: number;
  distance?: number;
  created_at: string;
  user_id: number | null;
}

export interface UserPrefs {
  /** "Date", "Group", or "Solo" */
  socialType: string;

  /** The enum value for the location (e.g., "Indoors", "Outdoors") */
  modality: string;

  /** ISO String or Date object for the start of the night */
  startDate: string | Date;

  /** ISO String or Date object for the end of the night */
  endDate: string | Date;

  /** The user's starting location or preferred radius (default "10") */
  currentLocation: {latitude: number; longitude: number};

  // How far the user is willing to travel from their current location
  travelDistance: number;

  /** Total budget for the entire night */
  budget: number;

  /** The 'Vibe' name (e.g., "Cozy", "High Energy") */
  vibe: string | null;

  /** Total number of people involved (calculated from socialType) */
  headCount: number;
}

export enum ActivityLocation {
  StayIn = "STAY_IN",
  GoOut = "GO_OUT",
}

export type SlotType = "AVAILABLE" | "OCCUPIED" | "TRAVEL";

export interface TimeSlot {
  id: string;
  title: string;
  startTime: number; // Minutes from start of day (e.g., 540 for 9:00 AM)
  endTime: number;
  type: SlotType;
  activity?: Activity | null;
}

export type PlanningStep = "ANCHOR" | "SUB_ANCHOR" | "FILLER" | "COMPLETE";
