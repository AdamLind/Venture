// src/lib/partnerDates.ts
// Your anniversary, your partner's birthday and their favorite vibes (#87).
// The database decides what you may know (partner_dates(): your partner's
// birthday only if they share it); see
// supabase/migrations/20261121020000_anniversaries_birthdays.sql.

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";

export interface PartnerDates {
  /** "YYYY-MM-DD", or null if not set */
  anniversary: string | null;
  /** Your partner's birthday, if they share it */
  partnerBirthday: {year: number; month: number; day: number} | null;
  /** The vibes your partner picks most when they plan (null until they've planned a couple) */
  partnerVibes: string[] | null;
}

const birthdayParts = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return {year, month, day};
};

export const NO_PARTNER_DATES: PartnerDates = {anniversary: null, partnerBirthday: null, partnerVibes: null};

export async function fetchPartnerDates(): Promise<PartnerDates> {
  const {data, error} = await supabase.rpc("partner_dates");
  if (error) throw new Error(friendlyError(error));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NO_PARTNER_DATES;
  return {
    anniversary: row.anniversary ?? null,
    partnerBirthday: row.partner_birthday ? birthdayParts(row.partner_birthday) : null,
    partnerVibes: Array.isArray(row.partner_vibes) && row.partner_vibes.length > 0 ? row.partner_vibes : null,
  };
}

/** Set (or clear, with null) your anniversary, for both of you */
export async function saveAnniversary(date: string | null): Promise<void> {
  const {error} = await supabase.rpc("set_anniversary", {p_date: date});
  if (error) throw new Error(friendlyError(error));
}
