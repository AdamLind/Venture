// hooks/useEarnedTitles.ts
// Your titles (#84): what you've earned from your finished dates, and the
// ones that show on Profile (your pick, or the hardest three). Shared by
// Profile and the titles menu (app/titles.tsx).

import {useMemo} from "react";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {useProfileStore} from "@/src/store/useProfileStore";
import {hasHomeArea} from "@/src/lib/profile";
import {earnedTitles, shownTitles} from "@/utils/titles";

export function useEarnedTitles() {
  const itineraries = useItineraryStore((s) => s.itineraries);
  const preferences = useProfileStore((s) => s.preferences);
  const featured = preferences?.featured_titles;

  const earned = useMemo(
    () =>
      earnedTitles(
        itineraries,
        preferences && hasHomeArea(preferences)
          ? {latitude: preferences.home_lat as number, longitude: preferences.home_lng as number}
          : null,
      ),
    [itineraries, preferences],
  );
  const shown = useMemo(() => shownTitles(earned, featured), [earned, featured]);
  const finished = useMemo(() => itineraries.filter((i) => i.status === "COMPLETED").length, [itineraries]);

  return {
    earned,
    shown,
    /** You picked them (not the hardest three, chosen for you) */
    picked: !!featured?.length && shown.length > 0 && shown.some((t) => featured.includes(t.id)),
    finished,
  };
}
