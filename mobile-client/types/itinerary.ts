export interface SimpleLocation {
  latitude: number;
  longitude: number;
}

export interface UserPrefs {
  /** "Date", "Group", or "Solo" */
  socialType: string;
  
  /** The enum value for the location (e.g., "Indoors", "Outdoors") */
  locationType: string; 
  
  /** ISO String or Date object for the start of the night */
  startDate: string | Date;
  
  /** ISO String or Date object for the end of the night */
  endDate: string | Date;
  
  /** The user's starting location or preferred radius (default "10") */
  currentLocation: string;

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
  GoOut = "GO_OUT"
}