// src/lib/editDate.ts
// Alternatives for one stop of a saved date (#36), found the builder's way
// with the prefs the date was planned with: the time that stop has (its own
// plus any spare), the budget left without it, where you'd come from, and
// how full / tired you'd be by then. Ranked in its place (utils/editDate.ts).

import type {UserPrefs} from "@/src/store/usePrefsStore";
import {useBlockStore} from "@/src/store/useBlockStore";
import {placedStops} from "@/src/lib/dates";
import type {Itinerary} from "@/types/dates";
import {queryCandidates} from "@/utils/itineraryEngine";
import {type Replacement, rankReplacements, roomAt} from "@/utils/editDate";
import {deriveSequentialTimeline, evaluateContextAt} from "@/utils/timeline";

export async function fetchReplacements(itinerary: Itinerary, index: number): Promise<Replacement[]> {
  const prefs = itinerary.prefs_snapshot as UserPrefs | null;
  if (!prefs) throw new Error("This date can't be edited (it was saved before editing existed).");
  const placed = placedStops(itinerary).map((s) => s.placed);
  if (!placed[index]) return [];

  const heads = Number(prefs.headCount) || 1;
  const othersCost = placed
    .filter((_, i) => i !== index)
    .reduce((sum, p) => sum + (Number(p.activity.est_price_per_person) || 0) * heads, 0);
  const budgetLeft = Math.max(0, (Number(prefs.budget) || 0) - othersCost);

  // Where you'd be, and how you'd feel, when this stop starts
  const timeline = deriveSequentialTimeline(placed, prefs);
  const slot = timeline.filter((s) => s.activity)[index];
  const context = slot ? {...evaluateContextAt(timeline, slot.startTime), atMs: slot.startTime} : {exhaustion: 0, satiation: 0};
  const origin = index > 0 ? (placed[index - 1].activity as any) : prefs;

  // In reach of the start and the date's other stops (a far-off anchor's
  // neighbors count)
  const others = placed.filter((_, i) => i !== index).map((p) => p.activity);
  const result = await queryCandidates(prefs, roomAt(placed, index, prefs), budgetLeft, origin, context, others);
  if (!result.success) throw new Error("Couldn't find alternatives. Please try again.");

  const blocked = useBlockStore.getState().ids;
  const candidates = (result.data ?? []).filter((a: any) => !(a.user_id && blocked.has(a.user_id)));
  return rankReplacements(candidates, placed, index, prefs);
}
