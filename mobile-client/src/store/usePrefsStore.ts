import {create} from "zustand";

export interface UserPrefs {
  userId: string | null;
  socialType: string;
  modality: string;
  startDate: string | Date;
  endDate: string | Date;
  currentLocation: {latitude: number; longitude: number} | null;
  /** Saved home (Planning defaults); stay-in stops happen here. Falls back to currentLocation. */
  homeLocation?: {latitude: number; longitude: number} | null;
  /**
   * Home as worked out from where the date first started (utils/timeline.ts
   * homeOf). Set for a re-planned stretch, which starts somewhere else; never
   * saved.
   */
  fixedHome?: {latitude: number; longitude: number} | null;
  travelDistance: number;
  budget: number;
  vibes: string[] | null;
  headCount: number;
  /** Hidden from your partner until you invite them or it's over (#35). The
   *  server reads this from the date's saved prefs as it's created. */
  surprise?: boolean;
  /**
   * This plan's shuffle (src/lib/random.ts): picked on Start planning and kept
   * with the draft, so ideas that rank the same come out in one random order
   * that stays put, and filling the date builds the same plan from it. A new
   * seed reshuffles.
   */
  seed?: number;
}

interface PrefsState {
  prefs: UserPrefs;
  draftUpdatedAt: number | null; // <-- ADDED: Tracks when they started planning
  setPrefs: (newPrefs: Partial<UserPrefs>) => void;
  resetPrefs: () => void;
}

const defaultPrefs: UserPrefs = {
  userId: null,
  socialType: "Date",
  modality: "GO_OUT",
  startDate: new Date(),
  endDate: new Date(Date.now() + 4 * 60 * 60_000), // +4 hours
  currentLocation: null,
  homeLocation: null,
  travelDistance: 10,
  budget: 50,
  vibes: [],
  headCount: 2,
  surprise: false,
};

export const usePrefsStore = create<PrefsState>((set) => ({
  prefs: defaultPrefs,
  draftUpdatedAt: null, // <-- ADDED: Initial state

  setPrefs: (newPrefs) =>
    set((state) => ({
      prefs: {...state.prefs, ...newPrefs},
      draftUpdatedAt: Date.now(), // <-- ADDED: Automatically update timestamp on every change
    })),

  resetPrefs: () =>
    set({
      prefs: defaultPrefs,
      draftUpdatedAt: null, // <-- ADDED: Clear timestamp on reset
    }),
}));
