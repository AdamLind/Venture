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

/** One trip between places, and the block it takes in the schedule (utils/timeline.ts travelLeg). */
export type TravelLeg = {
  /** Straight-line miles */
  miles: number;
  roadMiles: number;
  driveMinutes: number;
  parkingMinutes: number;
  /** Its place in the schedule (a whole number of 15-minute steps) */
  blockMinutes: number;
  /** Spare before setting off: stay a little longer */
  lingerMinutes: number;
  /** Spare on arrival: find the place, settle in */
  bufferMinutes: number;
};

export interface TimeSlot {
  id: string;
  title: string;
  startTime: number; // Minutes from start of day (e.g., 540 for 9:00 AM)
  endTime: number;
  type: SlotType;
  activity?: ScoredActivity | null; // Associates the scored DB item with the time slot
  /** Travel slots: the trip inside the block */
  travel?: TravelLeg;
}

export type PlanningStep = "ANCHOR" | "SUB_ANCHOR" | "FILLER" | "COMPLETE";
