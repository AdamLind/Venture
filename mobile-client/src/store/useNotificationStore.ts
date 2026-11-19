// src/store/useNotificationStore.ts
// In-app notifications (public.notifications): review decisions on your
// ideas, what happened to your reports, and (staff) reported ideas (#76).
// Staff alerts only show while Staff tools is on.
// Loaded by the root layout after sign-in and kept live with a realtime
// subscription, so the bell's dot appears as soon as a decision lands.

import {create} from "zustand";
import type {RealtimeChannel} from "@supabase/supabase-js";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {useMyIdeasStore} from "@/src/store/useMyIdeasStore";
import {useStaffStore, useStaffTools} from "@/src/store/useStaffStore";
import {useConnectionsStore} from "@/src/store/useConnectionsStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";

export type NotificationKind =
  | "IDEA_PUBLISHED"
  | "IDEA_NEEDS_REVISION"
  | "IDEA_REJECTED"
  /** Your idea is hidden from Discover while a moderator looks at reports */
  | "IDEA_HELD"
  /** Staff: an idea was reported */
  | "IDEA_REPORTED"
  /** Your report: we took it down */
  | "REPORT_ACTIONED"
  /** Your report: we looked, and it's within the guidelines */
  | "REPORT_DISMISSED"
  /** People (#35): actor is who it's about */
  | "CONNECTION_REQUEST"
  | "CONNECTION_ACCEPTED"
  | "PARTNER_REQUEST"
  | "PARTNER_ACCEPTED"
  /** Dates (#36): itinerary_id is the date, actor who did it */
  | "DATE_INVITE"
  | "DATE_INVITE_ACCEPTED"
  | "DATE_COMMENT";

/** About a shared date */
export const isDateKind = (kind: NotificationKind) =>
  kind === "DATE_INVITE" || kind === "DATE_INVITE_ACCEPTED" || kind === "DATE_COMMENT";

/** About a person, not an idea */
export const isPersonKind = (kind: NotificationKind) =>
  kind === "CONNECTION_REQUEST" ||
  kind === "CONNECTION_ACCEPTED" ||
  kind === "PARTNER_REQUEST" ||
  kind === "PARTNER_ACCEPTED";

/** Kinds only staff get; shown while Staff tools is on */
export const isStaffKind = (kind: NotificationKind) => kind === "IDEA_REPORTED";

export interface AppNotification {
  notification_id: number;
  kind: NotificationKind;
  idea_id: number | null;
  /** The date it's about (date kinds); its title is in idea_title */
  itinerary_id?: number | null;
  idea_title: string | null;
  note: string | null;
  created_at: string;
  /** null = new (unseen) */
  seen_at: string | null;
  activities?: {image_urls: string[] | null} | null;
  /** Who it's about (people kinds) */
  actor?: {username: string | null; profile_image_url: string | null} | null;
}

type Status = "idle" | "loading" | "ready" | "error";

interface NotificationState {
  userId: string | null;
  /** Newest first. */
  items: AppNotification[];
  status: Status;
  error: string | null;

  load: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
  /** Marks everything shown seen (moves it from New to Earlier next time).
   *  Staff alerts only when they're shown (Staff tools on). */
  markAllSeen: (includeStaff: boolean) => Promise<void>;
  clear: () => void;
}

const SELECT = `
  notification_id, kind, idea_id, itinerary_id, idea_title, note, created_at, seen_at,
  activities ( image_urls ),
  actor:users!notifications_actor_id_fkey ( username, profile_image_url )
`;

let channel: RealtimeChannel | null = null;

function unsubscribe() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  userId: null,
  items: [],
  status: "idle",
  error: null,

  load: async (userId) => {
    const firstLoad = get().userId !== userId;
    set({userId, status: "loading", error: null});

    if (firstLoad) {
      unsubscribe();
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            // A review decision: refresh the list and the idea's status;
            // a reported idea (staff): the queue's counts
            get().reload();
            useMyIdeasStore.getState().reload();
            useStaffStore.getState().refreshCounts();
            useConnectionsStore.getState().reload();
            // An invite or a comment on a date: the Dates tab picks it up
            useItineraryStore.getState().reload();
          },
        )
        .subscribe();
    }

    const {data, error} = await supabase
      .from("notifications")
      .select(SELECT)
      .eq("user_id", userId)
      .order("created_at", {ascending: false})
      .limit(50);

    if (get().userId !== userId) return;
    if (error) {
      set({status: "error", error: friendlyError(error)});
      return;
    }
    set({items: (data ?? []) as unknown as AppNotification[], status: "ready"});
  },

  reload: async () => {
    const {userId, load} = get();
    if (userId) await load(userId);
  },

  markAllSeen: async (includeStaff) => {
    const {userId, items} = get();
    const marks = (n: AppNotification) => !n.seen_at && (includeStaff || !isStaffKind(n.kind));
    if (!userId || !items.some(marks)) return;

    const seenAt = new Date().toISOString();
    set({items: items.map((n) => (marks(n) ? {...n, seen_at: seenAt} : n))});

    let query = supabase
      .from("notifications")
      .update({seen_at: seenAt})
      .eq("user_id", userId)
      .is("seen_at", null);
    if (!includeStaff) query = query.neq("kind", "IDEA_REPORTED");
    const {error} = await query;
    if (error) console.warn("Couldn't mark notifications seen:", error.message);
  },

  clear: () => {
    unsubscribe();
    set({userId: null, items: [], status: "idle", error: null});
  },
}));

/** The notifications to show: staff alerts only with Staff tools on. */
export function useVisibleNotifications() {
  const showStaff = useStaffTools();
  const items = useNotificationStore((s) => s.items);
  return {items: showStaff ? items : items.filter((n) => !isStaffKind(n.kind)), showStaff};
}

/** How many notifications are new (for the bell's dot). */
export const useUnseenCount = () => {
  const showStaff = useStaffTools();
  return useNotificationStore(
    (s) => s.items.filter((n) => !n.seen_at && (showStaff || !isStaffKind(n.kind))).length,
  );
};
