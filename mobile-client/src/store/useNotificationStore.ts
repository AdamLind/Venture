// src/store/useNotificationStore.ts
// In-app notifications (public.notifications): review decisions on your ideas.
// Loaded by the root layout after sign-in and kept live with a realtime
// subscription, so the bell's dot appears as soon as a decision lands.

import {create} from "zustand";
import type {RealtimeChannel} from "@supabase/supabase-js";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {useMyIdeasStore} from "@/src/store/useMyIdeasStore";

export type NotificationKind =
  | "IDEA_PUBLISHED"
  | "IDEA_NEEDS_REVISION"
  | "IDEA_REJECTED";

export interface AppNotification {
  notification_id: number;
  kind: NotificationKind;
  idea_id: number | null;
  idea_title: string | null;
  note: string | null;
  created_at: string;
  /** null = new (unseen) */
  seen_at: string | null;
  activities?: {image_urls: string[] | null} | null;
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
  /** Marks everything seen (moves it from New to Earlier next time). */
  markAllSeen: () => Promise<void>;
  clear: () => void;
}

const SELECT = `
  notification_id, kind, idea_id, idea_title, note, created_at, seen_at,
  activities ( image_urls )
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
            // A review decision: refresh the list and the idea's status
            get().reload();
            useMyIdeasStore.getState().reload();
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

  markAllSeen: async () => {
    const {userId, items} = get();
    if (!userId || !items.some((n) => !n.seen_at)) return;

    const seenAt = new Date().toISOString();
    set({items: items.map((n) => (n.seen_at ? n : {...n, seen_at: seenAt}))});

    const {error} = await supabase
      .from("notifications")
      .update({seen_at: seenAt})
      .eq("user_id", userId)
      .is("seen_at", null);
    if (error) console.warn("Couldn't mark notifications seen:", error.message);
  },

  clear: () => {
    unsubscribe();
    set({userId: null, items: [], status: "idle", error: null});
  },
}));

/** How many notifications are new (for the bell's dot). */
export const useUnseenCount = () =>
  useNotificationStore((s) => s.items.filter((n) => !n.seen_at).length);
