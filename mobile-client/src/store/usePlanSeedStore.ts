// src/store/usePlanSeedStore.ts
// "Plan a date with this": carries an idea from its page to the Plan tab
// (shown as "Starting with"), then to the builder, which places it first.
//
//   seed ........ the idea on the Plan form, until you start or remove it
//   startWith ... handed to the builder by "Start building"; the builder
//                 consumes it once (so resuming a draft doesn't re-add it)

import {create} from "zustand";

export type PlanSeed = {
  idea_id: number;
  title: string;
  image: string | null;
  modality: "GO_OUT" | "STAY_IN";
  est_price_per_person: number;
  est_duration_minutes: number | null;
  /** When it's best (activities.time_of_day); see src/lib/timeOfDay.ts */
  time_of_day: string[] | null;
};

interface PlanSeedState {
  seed: PlanSeed | null;
  startWith: PlanSeed | null;

  setSeed: (seed: PlanSeed | null) => void;
  /** Moves the seed to the builder's hand-off slot. */
  commit: () => void;
  /** The builder takes the hand-off (once). */
  take: () => PlanSeed | null;
  clear: () => void;
}

export const usePlanSeedStore = create<PlanSeedState>((set, get) => ({
  seed: null,
  startWith: null,

  setSeed: (seed) => set({seed}),
  commit: () => set({startWith: get().seed, seed: null}),
  take: () => {
    const startWith = get().startWith;
    if (startWith) set({startWith: null});
    return startWith;
  },
  clear: () => set({seed: null, startWith: null}),
}));
