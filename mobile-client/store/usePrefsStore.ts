import { create } from 'zustand';

export interface UserPrefs {
  userId: string | null;
  socialType: string;
  modality: string;
  startDate: string | Date;
  endDate: string | Date;
  currentLocation: { latitude: number; longitude: number } | null;
  travelDistance: number;
  budget: number;
  vibes: string[] | null;
  headCount: number;
}

interface PrefsState {
  prefs: UserPrefs;
  // A function to update the whole object at once
  setPrefs: (newPrefs: Partial<UserPrefs>) => void;
  // A function to clear/reset prefs if they start a new date
  resetPrefs: () => void;
}

const defaultPrefs: UserPrefs = {
  userId: null,
  socialType: "Date",
  modality: "GO_OUT",
  startDate: new Date(),
  endDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // +4 hours
  currentLocation: null,
  travelDistance: 10,
  budget: 50,
  vibes: [],
  headCount: 2,
};

export const usePrefsStore = create<PrefsState>((set) => ({
  prefs: defaultPrefs,
  
  // This allows you to update just one thing (like budget) without overwriting everything else
  setPrefs: (newPrefs) => 
    set((state) => ({ prefs: { ...state.prefs, ...newPrefs } })),
    
  resetPrefs: () => set({ prefs: defaultPrefs }),
}));