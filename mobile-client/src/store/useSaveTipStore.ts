// src/store/useSaveTipStore.ts
// The one-time tip on your first save with a partner (#35): a tap saves to
// "Ours", a long-press saves just for you. Shown once per account on this
// device (components/ideas/SaveTip.tsx, mounted by the root layout).

import AsyncStorage from "@react-native-async-storage/async-storage";
import {create} from "zustand";

import {useProfileStore} from "@/src/store/useProfileStore";

const seenKey = (userId: string) => `venture.saveTipSeen.${userId}`;

interface SaveTipState {
  /** The idea just saved, while the tip is open */
  ideaId: number | null;
  /** Shows the tip if it's never been seen. True when it showed. */
  showOnce: (ideaId: number) => Promise<boolean>;
  close: () => void;
}

export const useSaveTipStore = create<SaveTipState>((set) => ({
  ideaId: null,

  showOnce: async (ideaId) => {
    const userId = useProfileStore.getState().userId;
    if (!userId) return false;
    try {
      if (await AsyncStorage.getItem(seenKey(userId))) return false;
      await AsyncStorage.setItem(seenKey(userId), "1");
    } catch {
      // Can't remember it: don't nag
      return false;
    }
    set({ideaId});
    return true;
  },

  close: () => set({ideaId: null}),
}));
