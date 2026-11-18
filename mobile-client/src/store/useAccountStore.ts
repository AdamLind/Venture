// src/store/useAccountStore.ts
// Whether your account is suspended (public.account_suspensions, #76). A
// suspended account can still plan privately, but can't publish or report;
// the database enforces that, and the app says so up front. Loaded by the
// root layout after sign-in.

import {create} from "zustand";
import {supabase} from "@/src/supabase";

export interface Suspension {
  reason: string;
  created_at: string;
}

interface AccountState {
  userId: string | null;
  suspension: Suspension | null;

  load: (userId: string) => Promise<void>;
  clear: () => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  userId: null,
  suspension: null,

  load: async (userId) => {
    set({userId});
    const {data, error} = await supabase
      .from("account_suspensions")
      .select("reason, created_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (get().userId !== userId) return;
    // Not fatal: the database still refuses what a suspension stops
    if (error) {
      console.warn("Suspension check error:", error);
      return;
    }
    set({suspension: (data as Suspension | null) ?? null});
  },

  clear: () => set({userId: null, suspension: null}),
}));

/** The message for anything a suspension stops */
export const SUSPENDED_MESSAGE =
  "Your account is suspended, so you can't publish or report ideas right now. You can still plan with your own ideas.";
