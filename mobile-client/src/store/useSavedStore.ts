// src/store/useSavedStore.ts
// The Bucket List: ideas the signed-in user saved (public.saved_activities),
// plus the ones their partner shared with them (#35). Each of your saves is
// shared with your partner or private: a tap saves shared, a long-press on
// the bookmark saves privately. Loaded by the root layout after sign-in. Saving is optimistic:
// the bookmark fills right away and rolls back if the server says no.

import {create} from "zustand";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {IDEA_SUMMARY_COLUMNS} from "@/src/lib/ideas";
import type {SavedIdea} from "@/types/ideas";

type Status = "idle" | "loading" | "ready" | "error";

interface SavedState {
  userId: string | null;
  /** Your saved idea ids, for quick "is this saved?" checks on cards. */
  ids: Set<number>;
  /** Which of those are private (not shared with your partner), for the bookmark's look */
  privateIds: Set<number>;
  /** Your saves, newest first. */
  items: SavedIdea[];
  /** Your partner's shared saves, newest first (none without a partner). */
  partnerItems: SavedIdea[];
  status: Status;
  error: string | null;

  load: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
  /**
   * Saves or unsaves. Returns whether it's saved now. A new save is shared
   * with your partner unless `shared: false`.
   * Throws a readable Error.
   */
  toggle: (ideaId: number, opts?: {shared?: boolean}) => Promise<boolean>;
  /** Share one of your saves with your partner, or keep it private. */
  setShared: (ideaId: number, shared: boolean) => Promise<void>;
  clear: () => void;
}

const initialState = {
  userId: null,
  ids: new Set<number>(),
  privateIds: new Set<number>(),
  items: [],
  partnerItems: [],
  status: "idle" as Status,
  error: null,
};

// Ideas with a save/unsave request in flight (ignore double taps)
const pending = new Set<number>();

export const useSavedStore = create<SavedState>((set, get) => ({
  ...initialState,

  load: async (userId) => {
    set({userId, status: "loading", error: null});

    // Yours, and (through the database's rules) your partner's shared ones
    const {data, error} = await supabase
      .from("saved_activities")
      .select(`activity_id, user_id, shared, created_at, activities ( user_id, ${IDEA_SUMMARY_COLUMNS} )`)
      .order("created_at", {ascending: false});

    // Signed out or switched accounts while loading
    if (get().userId !== userId) return;

    if (error) {
      set({status: "error", error: friendlyError(error)});
      return;
    }

    const toItem = (row: any): SavedIdea => {
      const idea = row.activities;
      // Gone: deleted, or unpublished since (staff can still read those,
      // but like everyone else they can't plan with someone's unpublished
      // idea). Your partner's own idea they shared with you still shows.
      const visible =
        !!idea &&
        (idea.visibility === "PUBLISHED" || idea.user_id === userId || idea.user_id === row.user_id);
      return {
        activity_id: row.activity_id,
        saved_at: row.created_at,
        shared: !!row.shared,
        idea: visible ? idea : null,
      };
    };
    const rows = (data ?? []) as any[];
    const items = rows.filter((row) => row.user_id === userId).map(toItem);
    const partnerItems = rows.filter((row) => row.user_id !== userId).map(toItem).filter((item) => item.idea);
    set({
      items,
      partnerItems,
      ids: new Set(items.map((item) => item.activity_id)),
      privateIds: new Set(items.filter((item) => !item.shared).map((item) => item.activity_id)),
      status: "ready",
    });
  },

  reload: async () => {
    const {userId, load} = get();
    if (userId) await load(userId);
  },

  toggle: async (ideaId, opts) => {
    const {userId} = get();
    if (!userId) throw new Error("You're signed out.");
    if (pending.has(ideaId)) return get().ids.has(ideaId);

    const wasSaved = get().ids.has(ideaId);
    const wasPrivate = get().privateIds.has(ideaId);
    const shared = opts?.shared ?? true;
    const applyIds = (saved: boolean) => {
      const ids = new Set(get().ids);
      const privateIds = new Set(get().privateIds);
      if (saved) ids.add(ideaId);
      else ids.delete(ideaId);
      // The bookmark shows private right away, before the reload
      if (saved && !shared) privateIds.add(ideaId);
      else privateIds.delete(ideaId);
      set({
        ids,
        privateIds,
        // Unsaving drops the row right away; saving fills it in on reload
        items: saved
          ? get().items
          : get().items.filter((item) => item.activity_id !== ideaId),
      });
    };

    pending.add(ideaId);
    applyIds(!wasSaved);
    try {
      const {error} = wasSaved
        ? await supabase
            .from("saved_activities")
            .delete()
            .eq("user_id", userId)
            .eq("activity_id", ideaId)
        : await supabase
            .from("saved_activities")
            .insert({user_id: userId, activity_id: ideaId, shared});

      // Already saved (e.g. from another device) counts as saved
      if (error && error.code !== "23505") throw error;
    } catch (error) {
      applyIds(wasSaved);
      // Back as it was, private or not
      if (wasSaved && wasPrivate) set({privateIds: new Set(get().privateIds).add(ideaId)});
      throw new Error(friendlyError(error));
    } finally {
      pending.delete(ideaId);
    }

    // Fetch the newly saved idea's details for the Bucket List
    if (!wasSaved) get().reload();
    return !wasSaved;
  },

  setShared: async (ideaId, shared) => {
    const {userId, items} = get();
    if (!userId) throw new Error("You're signed out.");
    const apply = (value: boolean) => {
      const privateIds = new Set(get().privateIds);
      if (value) privateIds.delete(ideaId);
      else privateIds.add(ideaId);
      set({
        privateIds,
        items: get().items.map((item) => (item.activity_id === ideaId ? {...item, shared: value} : item)),
      });
    };
    const before = items.find((item) => item.activity_id === ideaId)?.shared ?? !get().privateIds.has(ideaId);
    apply(shared);
    const {error} = await supabase
      .from("saved_activities")
      .update({shared})
      .eq("user_id", userId)
      .eq("activity_id", ideaId);
    if (error) {
      apply(before);
      throw new Error(friendlyError(error));
    }
  },

  clear: () => {
    pending.clear();
    set({...initialState, ids: new Set(), privateIds: new Set()});
  },
}));
