// store/activeDateStore.ts
// The date currently in progress (drives the live-date screen and banner).
// The saved copy lives in useItineraryStore; this holds the rebuilt timeline.
import {create} from "zustand";

interface ActiveDateState {
  timeline: any[] | null;
  userPrefs: any | null;
  /** The saved itinerary this live date belongs to */
  itineraryId: number | null;
  /**
   * Stops you've marked "I'm here" / "Done" (by idea id). The clock still
   * moves things along on its own; these let you run ahead of (or behind)
   * the schedule.
   */
  arrivedIds: number[];
  doneIds: number[];

  startActiveDate: (timeline: any[], prefs: any, itineraryId: number) => void;
  markArrived: (ideaId: number) => void;
  markDone: (ideaId: number) => void;
  endActiveDate: () => void;
}

export const useActiveDateStore = create<ActiveDateState>((set, get) => ({
  timeline: null,
  userPrefs: null,
  itineraryId: null,
  arrivedIds: [],
  doneIds: [],

  startActiveDate: (timeline, userPrefs, itineraryId) =>
    set({timeline, userPrefs, itineraryId, arrivedIds: [], doneIds: []}),

  markArrived: (ideaId) => {
    if (!get().arrivedIds.includes(ideaId))
      set({arrivedIds: [...get().arrivedIds, ideaId]});
  },

  markDone: (ideaId) => {
    const {arrivedIds, doneIds} = get();
    set({
      arrivedIds: arrivedIds.includes(ideaId) ? arrivedIds : [...arrivedIds, ideaId],
      doneIds: doneIds.includes(ideaId) ? doneIds : [...doneIds, ideaId],
    });
  },

  // Clears the live view only; marking the saved date finished is done in
  // useItineraryStore.completeDate()
  endActiveDate: () =>
    set({timeline: null, userPrefs: null, itineraryId: null, arrivedIds: [], doneIds: []}),
}));
