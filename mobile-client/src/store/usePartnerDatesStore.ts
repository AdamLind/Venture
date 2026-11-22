// src/store/usePartnerDatesStore.ts
// Your anniversary, your partner's birthday and their favorite vibes (#87),
// for the Plan tab's chips and the partner card. Loaded when you have a
// partner (and again after you change the anniversary).

import {create} from "zustand";

import {NO_PARTNER_DATES, type PartnerDates, fetchPartnerDates, saveAnniversary} from "@/src/lib/partnerDates";

interface PartnerDatesState extends PartnerDates {
  /** The partner these are for (null: no partner, nothing loaded) */
  partnerId: string | null;
  load: (partnerId: string | null) => Promise<void>;
  setAnniversary: (date: string | null) => Promise<void>;
}

export const usePartnerDatesStore = create<PartnerDatesState>((set, get) => ({
  ...NO_PARTNER_DATES,
  partnerId: null,

  load: async (partnerId) => {
    if (!partnerId) {
      set({...NO_PARTNER_DATES, partnerId: null});
      return;
    }
    set({partnerId});
    try {
      const dates = await fetchPartnerDates();
      if (get().partnerId === partnerId) set(dates);
    } catch {
      // Not knowing just means no chips: nothing to tell anyone
    }
  },

  setAnniversary: async (date) => {
    await saveAnniversary(date);
    set({anniversary: date});
  },
}));
