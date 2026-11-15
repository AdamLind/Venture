// src/store/useHiddenStore.ts
// "Not interested": ideas the signed-in user hid (public.hidden_ideas).
// Hidden ideas drop out of Discover and the builder. Loaded by the root
// layout after sign-in. Hiding is optimistic and rolls back on failure.

import {create} from "zustand";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";

interface HiddenState {
  userId: string | null;
  ids: Set<number>;

  load: (userId: string) => Promise<void>;
  /** Throws a readable Error. */
  hide: (ideaId: number) => Promise<void>;
  /** Throws a readable Error. */
  unhide: (ideaId: number) => Promise<void>;
  clear: () => void;
}

export const useHiddenStore = create<HiddenState>((set, get) => {
  const apply = (ideaId: number, hidden: boolean) => {
    const ids = new Set(get().ids);
    if (hidden) ids.add(ideaId);
    else ids.delete(ideaId);
    set({ids});
  };

  return {
    userId: null,
    ids: new Set(),

    load: async (userId) => {
      set({userId});
      const {data, error} = await supabase
        .from("hidden_ideas")
        .select("idea_id")
        .eq("user_id", userId);
      if (get().userId !== userId) return;
      // Not fatal: worst case, a hidden idea shows up again
      if (error) {
        console.warn("Hidden ideas load error:", error);
        return;
      }
      set({ids: new Set((data ?? []).map((row) => row.idea_id as number))});
    },

    hide: async (ideaId) => {
      const {userId} = get();
      if (!userId) throw new Error("You're signed out.");
      apply(ideaId, true);
      const {error} = await supabase
        .from("hidden_ideas")
        .insert({user_id: userId, idea_id: ideaId});
      // Already hidden (another device) counts as hidden
      if (error && error.code !== "23505") {
        apply(ideaId, false);
        throw new Error(friendlyError(error));
      }
    },

    unhide: async (ideaId) => {
      const {userId} = get();
      if (!userId) throw new Error("You're signed out.");
      apply(ideaId, false);
      const {error} = await supabase
        .from("hidden_ideas")
        .delete()
        .eq("user_id", userId)
        .eq("idea_id", ideaId);
      if (error) {
        apply(ideaId, true);
        throw new Error(friendlyError(error));
      }
    },

    clear: () => set({userId: null, ids: new Set()}),
  };
});
