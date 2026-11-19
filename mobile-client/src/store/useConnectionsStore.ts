// src/store/useConnectionsStore.ts
// Your connections, partner and pending requests (#35). Loaded by the root
// layout after sign-in, and reloaded when a request or answer arrives (the
// notification store's realtime subscription).

import {create} from "zustand";

import {
  type Connection,
  type ConnectionRequest,
  fetchConnections,
  fetchRequests,
} from "@/src/lib/connections";

type Status = "idle" | "loading" | "ready" | "error";

interface ConnectionsState {
  userId: string | null;
  connections: Connection[];
  incoming: ConnectionRequest[];
  outgoing: ConnectionRequest[];
  status: Status;
  error: string | null;

  load: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
  clear: () => void;
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  userId: null,
  connections: [],
  incoming: [],
  outgoing: [],
  status: "idle",
  error: null,

  load: async (userId) => {
    set({userId, status: get().userId === userId ? get().status : "loading", error: null});
    try {
      const [connections, requests] = await Promise.all([fetchConnections(), fetchRequests(userId)]);
      if (get().userId !== userId) return;
      set({connections, ...requests, status: "ready"});
    } catch (e) {
      if (get().userId !== userId) return;
      set({status: "error", error: e instanceof Error ? e.message : "Couldn't load your connections"});
    }
  },

  reload: async () => {
    const {userId, load} = get();
    if (userId) await load(userId);
  },

  clear: () => set({userId: null, connections: [], incoming: [], outgoing: [], status: "idle", error: null}),
}));

/** Your partner, if you have one */
export const usePartner = () => useConnectionsStore((s) => s.connections.find((c) => c.is_partner) ?? null);
