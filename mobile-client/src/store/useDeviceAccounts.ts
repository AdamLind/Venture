// src/store/useDeviceAccounts.ts
// Accounts on this device (#31): switch between your account and test
// accounts without signing out or typing passwords, to try reporting,
// blocking and moderation from both sides.
//
// How: each account's session (not its password) is kept in AsyncStorage,
// where Supabase already keeps the current one, and swapped in with
// setSession. Sessions are kept up to date as they refresh, so a saved one
// stays valid. Off until someone taps "Add an account" (dev builds and
// admins see that); Sign out drops the account, since it ends that session.
// Switching itself lives in src/lib/signOut.ts, next to clearing the stores.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type {Session} from "@supabase/supabase-js";
import {create} from "zustand";

import {supabase} from "@/src/supabase";

const STORAGE_KEY = "venture.deviceAccounts.v1";

export interface DeviceAccount {
  userId: string;
  email: string | null;
  username: string | null;
  accessToken: string;
  refreshToken: string;
  lastUsedAt: string;
}

interface Saved {
  enabled: boolean;
  accounts: Record<string, DeviceAccount>;
}

interface DeviceAccountsState extends Saved {
  loaded: boolean;
  load: () => Promise<void>;
  /** Start keeping sessions (the first "Add an account") */
  enable: () => void;
  /** Save or update an account's session (only once enabled) */
  remember: (session: Session) => void;
  setUsername: (userId: string, username: string) => void;
  forget: (userId: string) => void;
}

function persist({enabled, accounts}: Saved) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({enabled, accounts})).catch((e) =>
    console.warn("Couldn't save device accounts:", e),
  );
}

export const useDeviceAccounts = create<DeviceAccountsState>((set, get) => {
  const update = (changes: Partial<Saved>) => {
    set(changes);
    const {enabled, accounts} = get();
    persist({enabled, accounts});
  };

  return {
    loaded: false,
    enabled: false,
    accounts: {},

    load: async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
        set({enabled: !!saved.enabled, accounts: saved.accounts ?? {}, loaded: true});
      } catch (e) {
        console.warn("Couldn't load device accounts:", e);
        set({loaded: true});
      }
    },

    enable: () => update({enabled: true}),

    remember: (session) => {
      if (!get().enabled) return;
      const prev = get().accounts[session.user.id];
      update({
        accounts: {
          ...get().accounts,
          [session.user.id]: {
            userId: session.user.id,
            email: session.user.email ?? prev?.email ?? null,
            username: prev?.username ?? null,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            lastUsedAt: new Date().toISOString(),
          },
        },
      });
    },

    setUsername: (userId, username) => {
      const account = get().accounts[userId];
      if (!account || account.username === username) return;
      update({accounts: {...get().accounts, [userId]: {...account, username}}});
    },

    forget: (userId) => {
      if (!get().accounts[userId]) return;
      const accounts = {...get().accounts};
      delete accounts[userId];
      update({accounts});
    },
  };
});

/** Keeps saved sessions current as they refresh. Call once; returns the unsubscribe. */
export function watchDeviceAccounts() {
  const store = useDeviceAccounts.getState();
  store.load().then(async () => {
    const {data} = await supabase.auth.getSession();
    if (data.session) useDeviceAccounts.getState().remember(data.session);
  });
  const {
    data: {subscription},
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session) useDeviceAccounts.getState().remember(session);
  });
  return () => subscription.unsubscribe();
}

/** Saved accounts, most recently used first */
export const sortedAccounts = (accounts: Record<string, DeviceAccount>) =>
  Object.values(accounts).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
