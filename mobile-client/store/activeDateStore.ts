// store/activeDateStore.ts
import { create } from 'zustand';

interface ActiveDateState {
  timeline: any[] | null;
  userPrefs: any | null;
  startActiveDate: (timeline: any[], prefs: any) => void;
  endActiveDate: () => void;
}

export const useActiveDateStore = create<ActiveDateState>((set) => ({
  timeline: null,
  userPrefs: null,
  
  // Call this when they click "Finalize Itinerary"
  startActiveDate: (timeline, userPrefs) => set({ timeline, userPrefs }),
  
  // Call this when the date is completely over
  endActiveDate: () => set({ timeline: null, userPrefs: null }),
}));