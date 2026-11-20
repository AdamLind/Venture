// src/store/usePlanSeedStore.ts
// "Plan a date with this" (one idea, from its page) or "Plan a date with
// these" (several, from Saved): carries the ideas to the Plan tab (shown as
// "Starting with"), then to the builder, which puts them in the best order.
//
//   seeds ....... the ideas on the Plan form, until you start or remove them
//   startWith ... handed to the builder by "Start building"; the builder
//                 consumes it once (so resuming a draft doesn't re-add them)

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

/** The most a date starts with (more and it's not a date, it's a list) */
export const MAX_SEEDS = 5;

interface PlanSeedState {
  seeds: PlanSeed[];
  startWith: PlanSeed[];

  /** One idea (or none) */
  setSeed: (seed: PlanSeed | null) => void;
  /** Several ideas (up to MAX_SEEDS) */
  setSeeds: (seeds: PlanSeed[]) => void;
  removeSeed: (ideaId: number) => void;
  /** Moves the seeds to the builder's hand-off slot. */
  commit: () => void;
  /** The builder takes the hand-off (once). */
  take: () => PlanSeed[];
  clear: () => void;
}

export const usePlanSeedStore = create<PlanSeedState>((set, get) => ({
  seeds: [],
  startWith: [],

  setSeed: (seed) => set({seeds: seed ? [seed] : []}),
  setSeeds: (seeds) => set({seeds: seeds.slice(0, MAX_SEEDS)}),
  removeSeed: (ideaId) => set({seeds: get().seeds.filter((s) => s.idea_id !== ideaId)}),
  commit: () => set({startWith: get().seeds, seeds: []}),
  take: () => {
    const startWith = get().startWith;
    if (startWith.length) set({startWith: []});
    return startWith;
  },
  clear: () => set({seeds: [], startWith: []}),
}));
