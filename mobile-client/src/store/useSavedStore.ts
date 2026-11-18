// src/store/useSavedStore.ts
// The Bucket List: ideas the signed-in user saved (public.saved_activities).
// Loaded by the root layout after sign-in. Saving is optimistic: the bookmark
// fills right away and rolls back if the server says no.

import {create} from "zustand";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {IDEA_SUMMARY_COLUMNS} from "@/src/lib/ideas";
import type {SavedIdea} from "@/types/ideas";

type Status = "idle" | "loading" | "ready" | "error";

interface SavedState {
  userId: string | null;
  /** Saved idea ids, for quick "is this saved?" checks on cards. */
  ids: Set<number>;
  /** Newest first. */
  items: SavedIdea[];
  status: Status;
  error: string | null;

  load: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
  /** Saves or unsaves. Returns whether it's saved now. Throws a readable Error. */
  toggle: (ideaId: number) => Promise<boolean>;
  clear: () => void;
}

const initialState = {
  userId: null,
  ids: new Set<number>(),
  items: [],
  status: "idle" as Status,
  error: null,
};

// Ideas with a save/unsave request in flight (ignore double taps)
const pending = new Set<number>();

export const useSavedStore = create<SavedState>((set, get) => ({
  ...initialState,

  load: async (userId) => {
    set({userId, status: "loading", error: null});

    const {data, error} = await supabase
      .from("saved_activities")
      .select(`activity_id, created_at, activities ( user_id, ${IDEA_SUMMARY_COLUMNS} )`)
      .eq("user_id", userId)
      .order("created_at", {ascending: false});

    // Signed out or switched accounts while loading
    if (get().userId !== userId) return;

    if (error) {
      set({status: "error", error: friendlyError(error)});
      return;
    }

    const items: SavedIdea[] = (data ?? []).map((row: any) => {
      const idea = row.activities;
      // Gone: deleted, or unpublished since (staff can still read those,
      // but like everyone else they can't plan with someone's unpublished idea)
      const visible = !!idea && (idea.visibility === "PUBLISHED" || idea.user_id === userId);
      return {
        activity_id: row.activity_id,
        saved_at: row.created_at,
        idea: visible ? idea : null,
      };
    });
    set({
      items,
      ids: new Set(items.map((item) => item.activity_id)),
      status: "ready",
    });
  },

  reload: async () => {
    const {userId, load} = get();
    if (userId) await load(userId);
  },

  toggle: async (ideaId) => {
    const {userId} = get();
    if (!userId) throw new Error("You're signed out.");
    if (pending.has(ideaId)) return get().ids.has(ideaId);

    const wasSaved = get().ids.has(ideaId);
    const applyIds = (saved: boolean) => {
      const ids = new Set(get().ids);
      if (saved) ids.add(ideaId);
      else ids.delete(ideaId);
      set({
        ids,
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
            .insert({user_id: userId, activity_id: ideaId});

      // Already saved (e.g. from another device) counts as saved
      if (error && error.code !== "23505") throw error;
    } catch (error) {
      applyIds(wasSaved);
      throw new Error(friendlyError(error));
    } finally {
      pending.delete(ideaId);
    }

    // Fetch the newly saved idea's details for the Bucket List
    if (!wasSaved) get().reload();
    return !wasSaved;
  },

  clear: () => {
    pending.clear();
    set({...initialState, ids: new Set()});
  },
}));
