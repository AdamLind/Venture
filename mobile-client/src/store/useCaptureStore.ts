// src/store/useCaptureStore.ts
// Live photos by date (#38, src/lib/captures.ts), shared by the live date,
// a date's page and Memories. Loaded per date (or a batch of past dates);
// a photo you take or delete shows everywhere at once.

import {create} from "zustand";

import {type Capture, deletePhoto, fetchCaptures} from "@/src/lib/captures";

interface CaptureState {
  /** itinerary_id → its photos, oldest first (missing: not loaded yet) */
  byDate: Record<number, Capture[]>;
  /** Loads (or reloads) these dates' photos. Not fatal: logs and keeps what it had */
  load: (itineraryIds: number[]) => Promise<void>;
  add: (capture: Capture) => void;
  /** Deletes one of your photos. Throws a readable Error */
  remove: (capture: Capture) => Promise<void>;
  clear: () => void;
}

export const useCaptureStore = create<CaptureState>((set, get) => ({
  byDate: {},

  load: async (itineraryIds) => {
    if (!itineraryIds.length) return;
    try {
      const captures = await fetchCaptures(itineraryIds);
      const next = {...get().byDate};
      for (const id of itineraryIds) next[id] = [];
      for (const c of captures) next[c.itinerary_id].push(c);
      set({byDate: next});
    } catch (e) {
      console.warn("Couldn't load date photos:", e);
    }
  },

  add: (capture) => {
    const list = get().byDate[capture.itinerary_id] ?? [];
    set({byDate: {...get().byDate, [capture.itinerary_id]: [...list, capture]}});
  },

  remove: async (capture) => {
    await deletePhoto(capture);
    const list = get().byDate[capture.itinerary_id] ?? [];
    set({
      byDate: {...get().byDate, [capture.itinerary_id]: list.filter((c) => c.capture_id !== capture.capture_id)},
    });
  },

  clear: () => set({byDate: {}}),
}));

const NONE: Capture[] = [];
/** One date's photos (empty until loaded) */
export const useDatePhotos = (itineraryId: number | null | undefined) =>
  useCaptureStore((s) => (itineraryId != null ? (s.byDate[itineraryId] ?? NONE) : NONE));
