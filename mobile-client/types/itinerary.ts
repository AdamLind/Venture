// types/itinerary.ts
import {BaseActivity} from "./activities";

// ─── ALGORITHM & SCORING MODELS ───

export interface ScoredActivity extends BaseActivity {
  distance: number; // Guaranteed to have a distance once scored
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

// ─── TIMELINE & SCHEDULING MODELS ───

export type SlotType = "AVAILABLE" | "OCCUPIED" | "BUFFER";

export interface TimeSlot {
  id: string;
  title: string;
  startTime: number; // Minutes from start of day (e.g., 540 for 9:00 AM)
  endTime: number;
  type: SlotType;
  activity?: ScoredActivity | null; // Associates the scored DB item with the time slot
}

export type PlanningStep = "ANCHOR" | "SUB_ANCHOR" | "FILLER" | "COMPLETE";
