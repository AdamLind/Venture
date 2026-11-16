// src/store/useBuilderStore.ts
import {create} from "zustand";
import {PlacedActivity} from "@/utils/itineraryEngine";

interface BuilderState {
  placed: PlacedActivity[];
  activities: any[];

  setPlaced: (
    placed: PlacedActivity[] | ((prev: PlacedActivity[]) => PlacedActivity[]),
  ) => void;
  setActivities: (activities: any[]) => void;
  clearBuilder: () => void;

  /** "Add to plan" on an idea's full page: the builder adds it on return */
  pendingAddId: number | null;
  requestAdd: (ideaId: number) => void;
  /** The builder takes the request (once) */
  takePendingAdd: () => number | null;
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  placed: [],
  activities: [],

  // This allows setPlaced((prev) => [...prev, newActivity]) to work identically to useState
  setPlaced: (updater) =>
    set((state) => ({
      placed: typeof updater === "function" ? updater(state.placed) : updater,
    })),

  setActivities: (activities) => set({activities}),

  clearBuilder: () => set({placed: [], activities: [], pendingAddId: null}),

  pendingAddId: null,
  requestAdd: (ideaId) => set({pendingAddId: ideaId}),
  takePendingAdd: () => {
    const id = get().pendingAddId;
    if (id != null) set({pendingAddId: null});
    return id;
  },
}));
