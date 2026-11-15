// src/store/useItineraryStore.ts
// Saved dates for the signed-in user. Loaded by the root layout after sign-in,
// reloaded after changes and on pull-to-refresh.

import {create} from "zustand";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {AUTO_COMPLETE_AFTER_MS, buildTimeline} from "@/src/lib/dates";
import {parseCoordinates} from "@/utils/itineraryEngine";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import type {
  Itinerary,
  ItineraryStatus,
  ItineraryStop,
  NewItinerary,
  StopActivity,
} from "@/types/dates";

type Status = "idle" | "loading" | "ready" | "error";

interface ItineraryState {
  userId: string | null;
  itineraries: Itinerary[];
  status: Status;
  error: string | null;

  load: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
  /** Saves a finalized date; returns its id. Throws a readable Error. */
  createItinerary: (input: NewItinerary) => Promise<number>;
  /** Marks a date ACTIVE and opens it as the live date. */
  startDate: (itineraryId: number) => Promise<void>;
  /** Marks a date COMPLETED and closes the live view if it's showing. */
  completeDate: (itineraryId: number) => Promise<void>;
  rename: (itineraryId: number, title: string) => Promise<void>;
  remove: (itineraryId: number) => Promise<void>;
  clear: () => void;
}

const SELECT = `
  itinerary_id, title, starts_at, ends_at, status, prefs_snapshot, created_at,
  itinerary_activities (
    stop_id, sort_order, starts_at, ends_at,
    activities ( *, venues ( name, address, coordinates ) )
  )
`;

function toStopActivity(row: any): StopActivity {
  const coords = parseCoordinates(row.venues?.coordinates);
  return {
    ...row,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    // The timeline engine expects scored activities
    distance: 0,
    score: 0,
  };
}

function toItinerary(row: any): Itinerary {
  const stops: ItineraryStop[] = (row.itinerary_activities ?? [])
    .map((s: any) => ({
      stop_id: s.stop_id,
      sort_order: s.sort_order,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      activity: s.activities ? toStopActivity(s.activities) : null,
    }))
    .sort((a: ItineraryStop, b: ItineraryStop) => a.sort_order - b.sort_order);

  return {
    itinerary_id: row.itinerary_id,
    title: row.title,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    prefs_snapshot: row.prefs_snapshot ?? null,
    created_at: row.created_at ?? null,
    stops,
  };
}

/** Keeps the live-date screen in sync with what's saved. */
function syncActiveDate(itineraries: Itinerary[]) {
  const active = itineraries.find((i) => i.status === "ACTIVE");
  const live = useActiveDateStore.getState();

  if (active && live.itineraryId !== active.itinerary_id) {
    const timeline = buildTimeline(active);
    if (timeline) {
      live.startActiveDate(timeline, active.prefs_snapshot, active.itinerary_id);
    }
  } else if (!active && live.itineraryId != null) {
    live.endActiveDate();
  }
}

const initialState = {
  userId: null,
  itineraries: [] as Itinerary[],
  status: "idle" as Status,
  error: null,
};

export const useItineraryStore = create<ItineraryState>((set, get) => {
  const setStatus = async (ids: number[], status: ItineraryStatus) => {
    const {error} = await supabase
      .from("itineraries")
      .update({status})
      .in("itinerary_id", ids);
    if (error) throw new Error(friendlyError(error));
    set({
      itineraries: get().itineraries.map((i) =>
        ids.includes(i.itinerary_id) ? {...i, status} : i,
      ),
    });
  };

  return {
    ...initialState,

    load: async (userId) => {
      set({userId, status: "loading", error: null});

      const {data, error} = await supabase
        .from("itineraries")
        .select(SELECT)
        .order("starts_at", {ascending: true});

      if (get().userId !== userId) return; // signed out meanwhile
      if (error) {
        console.error("Itinerary load failed:", error);
        set({status: "error", error: friendlyError(error)});
        return;
      }

      set({itineraries: (data ?? []).map(toItinerary), status: "ready"});

      // Dates that ended a while ago are finished, even if nobody tapped End
      const cutoff = Date.now() - AUTO_COMPLETE_AFTER_MS;
      const stale = get()
        .itineraries.filter(
          (i) =>
            (i.status === "PLANNED" || i.status === "ACTIVE") &&
            new Date(i.ends_at).getTime() < cutoff,
        )
        .map((i) => i.itinerary_id);
      if (stale.length) {
        try {
          await setStatus(stale, "COMPLETED");
        } catch (e) {
          console.warn("Auto-complete failed:", e);
        }
      }

      syncActiveDate(get().itineraries);
    },

    reload: async () => {
      const {userId, load} = get();
      if (userId) await load(userId);
    },

    createItinerary: async ({title, startsAt, endsAt, stops, prefsSnapshot}) => {
      const {data, error} = await supabase.rpc("create_itinerary", {
        p_title: title,
        p_starts_at: startsAt.toISOString(),
        p_ends_at: endsAt.toISOString(),
        p_stops: stops,
        p_prefs_snapshot: prefsSnapshot,
      });
      if (error) throw new Error(friendlyError(error));
      await get().reload();
      return data as number;
    },

    startDate: async (itineraryId) => {
      // Only one live date at a time: finish any other one first
      const others = get()
        .itineraries.filter(
          (i) => i.status === "ACTIVE" && i.itinerary_id !== itineraryId,
        )
        .map((i) => i.itinerary_id);
      if (others.length) await setStatus(others, "COMPLETED");

      await setStatus([itineraryId], "ACTIVE");

      const itinerary = get().itineraries.find(
        (i) => i.itinerary_id === itineraryId,
      );
      const timeline = itinerary ? buildTimeline(itinerary) : null;
      if (!itinerary || !timeline) {
        throw new Error("This date has no stops left to show.");
      }
      useActiveDateStore
        .getState()
        .startActiveDate(timeline, itinerary.prefs_snapshot, itineraryId);
    },

    completeDate: async (itineraryId) => {
      await setStatus([itineraryId], "COMPLETED");
      const live = useActiveDateStore.getState();
      if (live.itineraryId === itineraryId) live.endActiveDate();
    },

    rename: async (itineraryId, title) => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error("Give your date a name.");
      const {error} = await supabase
        .from("itineraries")
        .update({title: trimmed})
        .eq("itinerary_id", itineraryId);
      if (error) throw new Error(friendlyError(error));
      set({
        itineraries: get().itineraries.map((i) =>
          i.itinerary_id === itineraryId ? {...i, title: trimmed} : i,
        ),
      });
    },

    remove: async (itineraryId) => {
      const {error} = await supabase
        .from("itineraries")
        .delete()
        .eq("itinerary_id", itineraryId);
      if (error) throw new Error(friendlyError(error));
      set({
        itineraries: get().itineraries.filter(
          (i) => i.itinerary_id !== itineraryId,
        ),
      });
      const live = useActiveDateStore.getState();
      if (live.itineraryId === itineraryId) live.endActiveDate();
    },

    clear: () => set(initialState),
  };
});
