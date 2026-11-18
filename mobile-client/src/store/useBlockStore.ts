// src/store/useBlockStore.ts
// Creators you blocked (public.blocked_users, #76): their ideas drop out of
// Discover and the builder, like hidden ideas. Nobody is told. Loaded by the
// root layout after sign-in; blocking is optimistic and rolls back on failure.

import {create} from "zustand";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";

interface BlockState {
  userId: string | null;
  /** Blocked creators' user ids */
  ids: Set<string>;

  load: (userId: string) => Promise<void>;
  /** Throws a readable Error. */
  block: (creatorId: string) => Promise<void>;
  /** Throws a readable Error. */
  unblock: (creatorId: string) => Promise<void>;
  clear: () => void;
}

export const useBlockStore = create<BlockState>((set, get) => {
  const apply = (creatorId: string, blocked: boolean) => {
    const ids = new Set(get().ids);
    if (blocked) ids.add(creatorId);
    else ids.delete(creatorId);
    set({ids});
  };

  return {
    userId: null,
    ids: new Set(),

    load: async (userId) => {
      set({userId});
      const {data, error} = await supabase.from("blocked_users").select("blocked_id").eq("user_id", userId);
      if (get().userId !== userId) return;
      // Not fatal: worst case, a blocked creator's idea shows up again
      if (error) {
        console.warn("Blocked creators load error:", error);
        return;
      }
      set({ids: new Set((data ?? []).map((row) => row.blocked_id as string))});
    },

    block: async (creatorId) => {
      const {userId} = get();
      if (!userId) throw new Error("You're signed out.");
      apply(creatorId, true);
      const {error} = await supabase.from("blocked_users").insert({user_id: userId, blocked_id: creatorId});
      // Already blocked (another device) counts as blocked
      if (error && error.code !== "23505") {
        apply(creatorId, false);
        throw new Error(friendlyError(error));
      }
    },

    unblock: async (creatorId) => {
      const {userId} = get();
      if (!userId) throw new Error("You're signed out.");
      apply(creatorId, false);
      const {error} = await supabase
        .from("blocked_users")
        .delete()
        .eq("user_id", userId)
        .eq("blocked_id", creatorId);
      if (error) {
        apply(creatorId, true);
        throw new Error(friendlyError(error));
      }
    },

    clear: () => set({userId: null, ids: new Set()}),
  };
});
