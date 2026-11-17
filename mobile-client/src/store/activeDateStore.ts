// store/activeDateStore.ts
// The date currently in progress (drives the live-date screen and banner).
// The saved copy lives in useItineraryStore; this holds the rebuilt timeline.
import {useMemo} from "react";
import {create} from "zustand";
import {liveTimeline} from "@/utils/liveTimeline";

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
  /** When you tapped them (by idea id): the live timeline follows these */
  arrivedAt: Record<number, number>;
  doneAt: Record<number, number>;

  startActiveDate: (timeline: any[], prefs: any, itineraryId: number) => void;
  /** The rest of the date was re-planned (#63): new timeline, same progress */
  replaceTimeline: (timeline: any[], prefs: any) => void;
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
  arrivedAt: {},
  doneAt: {},

  startActiveDate: (timeline, userPrefs, itineraryId) =>
    set({timeline, userPrefs, itineraryId, arrivedIds: [], doneIds: [], arrivedAt: {}, doneAt: {}}),

  replaceTimeline: (timeline, userPrefs) => set({timeline, userPrefs}),

  markArrived: (ideaId) => {
    if (!get().arrivedIds.includes(ideaId))
      set({
        arrivedIds: [...get().arrivedIds, ideaId],
        arrivedAt: {...get().arrivedAt, [ideaId]: Date.now()},
      });
  },

  markDone: (ideaId) => {
    const {arrivedIds, doneIds, doneAt} = get();
    if (doneIds.includes(ideaId)) return;
    set({
      arrivedIds: arrivedIds.includes(ideaId) ? arrivedIds : [...arrivedIds, ideaId],
      doneIds: [...doneIds, ideaId],
      doneAt: {...doneAt, [ideaId]: Date.now()},
    });
  },

  // Clears the live view only; marking the saved date finished is done in
  // useItineraryStore.completeDate()
  endActiveDate: () =>
    set({
      timeline: null,
      userPrefs: null,
      itineraryId: null,
      arrivedIds: [],
      doneIds: [],
      arrivedAt: {},
      doneAt: {},
    }),
}));

/**
 * The live date's timeline as it's really going: the saved plan, moved by
 * your "I'm here" and "Done" taps (utils/liveTimeline.ts).
 */
export function useLiveTimeline() {
  const timeline = useActiveDateStore((s) => s.timeline);
  const arrivedAt = useActiveDateStore((s) => s.arrivedAt);
  const doneAt = useActiveDateStore((s) => s.doneAt);
  return useMemo(() => liveTimeline(timeline, {arrivedAt, doneAt}), [timeline, arrivedAt, doneAt]);
}
