// store/activeDateStore.ts
// The date currently in progress (drives the live-date screen and banner).
// The saved copy lives in useItineraryStore; this holds the rebuilt timeline.
import {create} from "zustand";

interface ActiveDateState {
  timeline: any[] | null;
  userPrefs: any | null;
  /** The saved itinerary this live date belongs to */
  itineraryId: number | null;
  startActiveDate: (timeline: any[], prefs: any, itineraryId: number) => void;
  endActiveDate: () => void;
}

export const useActiveDateStore = create<ActiveDateState>((set) => ({
  timeline: null,
  userPrefs: null,
  itineraryId: null,

  startActiveDate: (timeline, userPrefs, itineraryId) =>
    set({timeline, userPrefs, itineraryId}),

  // Clears the live view only; marking the saved date finished is done in
  // useItineraryStore.completeDate()
  endActiveDate: () => set({timeline: null, userPrefs: null, itineraryId: null}),
}));
