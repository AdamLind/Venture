// src/store/useStaffStore.ts
// Moderator / admin role for the signed-in user (public.staff, #26).
//
// Staff are regular users with extra powers. Their tools are off by default
// ("Staff tools" in Settings), so the app looks like everyone else's until
// they turn them on. The switch is remembered per account on this device.
// The role itself is enforced by the database; this only decides what to show.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {create} from "zustand";

import {supabase} from "@/src/supabase";

export type StaffRole = "MODERATOR" | "ADMIN";

interface StaffState {
  userId: string | null;
  role: StaffRole | null;
  /** Staff tools on: review extras inline (idea pages, Explore, the tab badge) */
  toolsOn: boolean;
  /** Ideas waiting for review, and ideas with open reports */
  counts: {toReview: number; reported: number};
  /** Open reports per idea, for flags on Explore cards (staff tools on) */
  reportedIdeas: Map<number, number>;

  load: (userId: string) => Promise<void>;
  setToolsOn: (on: boolean) => void;
  /** Re-count the queue (after a decision, or pulling to refresh). */
  refreshCounts: () => Promise<void>;
  clear: () => void;
}

const toolsKey = (userId: string) => `venture.staffTools.${userId}`;

const initialState = {
  userId: null,
  role: null,
  toolsOn: false,
  counts: {toReview: 0, reported: 0},
  reportedIdeas: new Map<number, number>(),
};

export const useStaffStore = create<StaffState>((set, get) => ({
  ...initialState,

  load: async (userId) => {
    set({...initialState, userId});
    const {data, error} = await supabase
      .from("staff")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (get().userId !== userId) return;
    // Not fatal: no staff tools this session
    if (error) {
      console.warn("Staff role load error:", error.message);
      return;
    }
    const role = (data?.role as StaffRole | undefined) ?? null;
    if (!role) return;

    let toolsOn = false;
    try {
      toolsOn = (await AsyncStorage.getItem(toolsKey(userId))) === "1";
    } catch {
      // Storage unavailable: start with them off
    }
    if (get().userId !== userId) return;
    set({role, toolsOn});
    await get().refreshCounts();
  },

  setToolsOn: (on) => {
    const {userId, role} = get();
    if (!userId || !role) return;
    set({toolsOn: on});
    AsyncStorage.setItem(toolsKey(userId), on ? "1" : "0").catch(() => {});
  },

  refreshCounts: async () => {
    const {userId, role} = get();
    if (!userId || !role) return;

    let pending = supabase
      .from("activities")
      .select("idea_id", {count: "exact", head: true})
      .eq("visibility", "PENDING_REVIEW");
    // Moderators can't review their own ideas, so they aren't waiting on them
    if (role !== "ADMIN") pending = pending.neq("user_id", userId);

    const [pendingResult, reportsResult] = await Promise.all([
      pending,
      supabase.from("idea_reports").select("idea_id").eq("status", "OPEN"),
    ]);
    if (get().userId !== userId) return;

    const reportedIdeas = new Map<number, number>();
    for (const row of reportsResult.data ?? []) {
      reportedIdeas.set(row.idea_id, (reportedIdeas.get(row.idea_id) ?? 0) + 1);
    }
    set({
      counts: {
        toReview: pendingResult.count ?? get().counts.toReview,
        reported: reportsResult.error ? get().counts.reported : reportedIdeas.size,
      },
      reportedIdeas: reportsResult.error ? get().reportedIdeas : reportedIdeas,
    });
  },

  clear: () => set(initialState),
}));

/** Staff with their tools switched on: show the review extras. */
export const useStaffTools = () => useStaffStore((s) => !!s.role && s.toolsOn);
