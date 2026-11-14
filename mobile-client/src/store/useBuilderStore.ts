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
}

export const useBuilderStore = create<BuilderState>((set) => ({
  placed: [],
  activities: [],

  // This allows setPlaced((prev) => [...prev, newActivity]) to work identically to useState
  setPlaced: (updater) =>
    set((state) => ({
      placed: typeof updater === "function" ? updater(state.placed) : updater,
    })),

  setActivities: (activities) => set({activities}),

  clearBuilder: () => set({placed: [], activities: []}),
}));
