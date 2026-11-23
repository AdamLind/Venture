// src/store/useItineraryStore.ts
// Saved dates for the signed-in user. Loaded by the root layout after sign-in,
// reloaded after changes and on pull-to-refresh.

import {create} from "zustand";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {AUTO_COMPLETE_AFTER_MS, buildTimeline, placedStops} from "@/src/lib/dates";
import {applyReplan, type DatePrefs, type ReplanPoint} from "@/utils/replan";
import {type PlacedActivity, deriveSequentialTimeline} from "@/utils/timeline";
import {endOfTimeline} from "@/utils/editDate";
import {parseCoordinates} from "@/utils/itineraryEngine";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import type {
  DatePerson,
  DateRole,
  InviteStatus,
  Itinerary,
  ItineraryStatus,
  ItineraryStop,
  NewItinerary,
  StopActivity,
} from "@/types/dates";

type Status = "idle" | "loading" | "ready" | "error";

interface ItineraryState {
  userId: string | null;
  /** Your dates and the ones you've said yes to */
  itineraries: Itinerary[];
  /** Dates you're invited to and haven't answered (#36) */
  invites: Itinerary[];
  /** Your partner's dates, view only (#35): you're not on them, they're not surprises */
  partnerDates: Itinerary[];
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
  /**
   * The rest of a live date in a new order (#63): saves the new stop order
   * and times, and updates the live view. `rest` is the stops after
   * `point.kept`, reordered (the same PlacedActivity objects as
   * placedStops()). Throws a readable Error.
   */
  replanDate: (itineraryId: number, point: ReplanPoint, rest: PlacedActivity[]) => Promise<void>;
  /**
   * Skip a stop that's still ahead on a live date (#9: it's closed, or you'd
   * rather not): removes it, and the rest of the date is laid out again from
   * `point` (utils/replan.ts). `ideaId` is the stop's idea. Throws a
   * readable Error.
   */
  skipStop: (itineraryId: number, point: ReplanPoint, ideaId: number) => Promise<void>;
  rename: (itineraryId: number, title: string) => Promise<void>;
  remove: (itineraryId: number) => Promise<void>;
  /**
   * A planned date's stops after an edit (#36): in order, each an existing
   * stop (stopId) or a new idea. Laid out again with the date's prefs and
   * saved; stops left out are removed. Throws a readable Error.
   */
  editStops: (itineraryId: number, stops: {stopId?: number; placed: PlacedActivity}[]) => Promise<void>;
  /** Mark a date a surprise for your partner, or not (#35). Throws a readable Error. */
  setSurprise: (itineraryId: number, surprise: boolean) => Promise<void>;
  /** Accept or decline an invite to a date (#36). Throws a readable Error. */
  respondToInvite: (itineraryId: number, accept: boolean) => Promise<void>;
  clear: () => void;
}

/** The owner and editors can change a date; commenters and viewers can't */
export const canEditDate = (i: Pick<Itinerary, "my_role"> | null | undefined) =>
  i?.my_role === "OWNER" || i?.my_role === "EDITOR";

const SELECT = `
  itinerary_id, title, starts_at, ends_at, status, prefs_snapshot, created_at,
  created_by, default_role, is_surprise,
  itinerary_users ( user_id, role, invite_status, users ( username, profile_image_url ) ),
  itinerary_comments ( count ),
  itinerary_activities (
    stop_id, sort_order, starts_at, ends_at,
    activities ( *, venues ( name, address, coordinates, opening_hours, created_by ) )
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

function toItinerary(row: any, me: string | null): Itinerary {
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
    ...sharing(row, me),
  };
}

/** Your role and status, the other people on it, and its comment count */
function sharing(row: any, me: string | null) {
  const members: any[] = row.itinerary_users ?? [];
  const mine = members.find((m) => m.user_id === me);
  const roleOf = (m: any): DateRole => (m.role ?? row.default_role ?? "COMMENTER") as DateRole;
  const people: DatePerson[] = members
    .filter((m) => m.user_id !== me && m.invite_status !== "DECLINED")
    .map((m) => ({
      user_id: m.user_id,
      username: m.users?.username ?? null,
      profile_image_url: m.users?.profile_image_url ?? null,
      role: roleOf(m),
      invite_status: m.invite_status as InviteStatus,
    }));
  return {
    created_by: row.created_by ?? null,
    is_surprise: !!row.is_surprise,
    my_role: mine ? roleOf(mine) : null,
    my_status: (mine?.invite_status ?? null) as InviteStatus | null,
    people,
    comment_count: row.itinerary_comments?.[0]?.count ?? 0,
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
  invites: [] as Itinerary[],
  partnerDates: [] as Itinerary[],
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

      // Yours and accepted ones are your dates; unanswered invites wait apart
      const all = (data ?? []).map((row) => toItinerary(row, userId));
      set({
        itineraries: all.filter((i) => i.my_status === "ACCEPTED"),
        invites: all.filter((i) => i.my_status === "PENDING"),
        // Not on it at all: your partner's (the database only shows you those)
        partnerDates: all.filter((i) => i.my_status === null),
        status: "ready",
      });

      // Dates that ended a while ago are finished, even if nobody tapped End
      // (only the ones you can change)
      const cutoff = Date.now() - AUTO_COMPLETE_AFTER_MS;
      const stale = get()
        .itineraries.filter(
          (i) =>
            canEditDate(i) &&
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

    replanDate: async (itineraryId, point, rest) => {
      const itinerary = get().itineraries.find((i) => i.itinerary_id === itineraryId);
      if (!itinerary?.prefs_snapshot) throw new Error("This date can't be changed.");
      const prefs = itinerary.prefs_snapshot as DatePrefs;
      const stops = placedStops(itinerary);
      // By idea (applyReplan may copy a stop to trim it)
      const stopIdOf = new Map(stops.map((s) => [s.placed.activity, s.stopId]));

      const {placed, replans, timeline} = applyReplan(
        stops.map((s) => s.placed),
        prefs,
        point,
        rest,
      );
      // The new times, stop by stop (timeline order = placed order)
      const slots = timeline.filter((slot) => slot.activity);
      const visible = placed.map((p, i) => ({
        stop_id: stopIdOf.get(p.activity)!,
        starts_at: new Date(slots[i].startTime).toISOString(),
        ends_at: new Date(slots[i].endTime).toISOString(),
      }));
      if (visible.some((s) => s.stop_id == null)) {
        throw new Error("This date changed since you opened it. Reopen it and try again.");
      }
      // Stops you can't see (an idea that was removed) stay at the end, as they were
      const hidden = itinerary.stops
        .filter((s) => !s.activity)
        .map((s) => ({stop_id: s.stop_id, starts_at: s.starts_at, ends_at: s.ends_at}));
      const endsAt = timeline
        .filter((slot) => slot.type === "OCCUPIED")
        .reduce((end, slot) => Math.max(end, slot.endTime), 0);

      const {error} = await supabase.rpc("replan_itinerary", {
        p_itinerary_id: itineraryId,
        p_stops: [...visible, ...hidden],
        p_replans: replans,
        p_ends_at: new Date(endsAt).toISOString(),
      });
      if (error) throw new Error(friendlyError(error));

      // Show it right away; the reload brings everyone's copy in line
      const snapshot: DatePrefs = {...prefs, replans};
      const live = useActiveDateStore.getState();
      if (live.itineraryId === itineraryId) live.replaceTimeline(timeline, snapshot);
      await get().reload();
    },

    skipStop: async (itineraryId, point, ideaId) => {
      const itinerary = get().itineraries.find((i) => i.itinerary_id === itineraryId);
      if (!itinerary?.prefs_snapshot) throw new Error("This date can't be changed.");
      const prefs = itinerary.prefs_snapshot as DatePrefs;
      const stops = placedStops(itinerary);
      const skipped = stops.find((s) => s.placed.activity.idea_id === ideaId);
      // Only a stop that's still ahead (the ones before stay as they were)
      if (!skipped || stops.indexOf(skipped) < point.kept) {
        throw new Error("This date changed since you opened it. Reopen it and try again.");
      }
      if (stops.length === 1) throw new Error("That's the last stop. End the date instead.");
      const stopIdOf = new Map(stops.map((s) => [s.placed.activity, s.stopId]));
      const all = stops.map((s) => s.placed);
      const rest = all.slice(point.kept).filter((p) => p !== skipped.placed);

      const {placed, replans, timeline} = applyReplan(all, prefs, point, rest);
      const slots = timeline.filter((slot) => slot.activity);
      const visible = placed.map((p, i) => ({
        stop_id: stopIdOf.get(p.activity)!,
        starts_at: new Date(slots[i].startTime).toISOString(),
        ends_at: new Date(slots[i].endTime).toISOString(),
      }));
      if (visible.some((s) => s.stop_id == null)) {
        throw new Error("This date changed since you opened it. Reopen it and try again.");
      }
      const hidden = itinerary.stops
        .filter((s) => !s.activity)
        .map((s) => ({stop_id: s.stop_id, starts_at: s.starts_at, ends_at: s.ends_at}));
      const endsAt = timeline
        .filter((slot) => slot.type === "OCCUPIED")
        .reduce((end, slot) => Math.max(end, slot.endTime), 0);

      const {error} = await supabase.rpc("skip_stop", {
        p_itinerary_id: itineraryId,
        p_stop_id: skipped.stopId,
        p_stops: [...visible, ...hidden],
        p_replans: replans,
        p_ends_at: new Date(endsAt).toISOString(),
      });
      if (error) throw new Error(friendlyError(error));

      const snapshot: DatePrefs = {...prefs, replans};
      const live = useActiveDateStore.getState();
      if (live.itineraryId === itineraryId) live.replaceTimeline(timeline, snapshot);
      await get().reload();
    },

    editStops: async (itineraryId, stops) => {
      const itinerary = get().itineraries.find((i) => i.itinerary_id === itineraryId);
      if (!itinerary?.prefs_snapshot) throw new Error("This date can't be edited.");
      if (stops.length === 0) throw new Error("A date needs at least one stop. Delete the date instead.");
      const prefs = itinerary.prefs_snapshot as DatePrefs;

      // The builder's timeline for the new stops: their times, and the end
      const timeline = deriveSequentialTimeline(stops.map((s) => s.placed), prefs);
      const slots = timeline.filter((slot) => slot.activity);
      const payload = stops.map((s, i) => ({
        ...(s.stopId != null ? {stop_id: s.stopId} : {activity_id: s.placed.activity.idea_id}),
        starts_at: new Date(slots[i].startTime).toISOString(),
        ends_at: new Date(slots[i].endTime).toISOString(),
      }));

      const {error} = await supabase.rpc("edit_itinerary_stops", {
        p_itinerary_id: itineraryId,
        p_stops: payload,
        p_ends_at: new Date(endOfTimeline(timeline)).toISOString(),
      });
      if (error) throw new Error(error.message || friendlyError(error));
      await get().reload();
    },

    setSurprise: async (itineraryId, surprise) => {
      const {error} = await supabase
        .from("itineraries")
        .update({is_surprise: surprise})
        .eq("itinerary_id", itineraryId);
      if (error) throw new Error(friendlyError(error));
      set({
        itineraries: get().itineraries.map((i) =>
          i.itinerary_id === itineraryId ? {...i, is_surprise: surprise} : i,
        ),
      });
    },

    respondToInvite: async (itineraryId, accept) => {
      const {error} = await supabase.rpc("respond_to_date_invite", {
        p_itinerary_id: itineraryId,
        p_accept: accept,
      });
      if (error) throw new Error(error.message || friendlyError(error));
      await get().reload();
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
