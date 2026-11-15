// src/lib/dates.ts
// Helpers for saved dates: titles, labels, grouping, and rebuilding timelines.

import type {Itinerary, ItineraryStop} from "@/types/dates";
import type {TimeSlot} from "@/types/itinerary";
import {deriveSequentialTimeline} from "@/utils/itineraryEngine";

/** Finished dates are auto-completed this long after their scheduled end. */
export const AUTO_COMPLETE_AFTER_MS = 2 * 60 * 60 * 1000;

/** Offer "Start now" after finalizing when the date begins within this window. */
export const START_NOW_WINDOW_MS = 60 * 60 * 1000;

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=800&auto=format&fit=crop";

/** "Tacos & Comedy" from the first two stop titles. */
export function autoTitle(stopTitles: string[]): string {
  const titles = stopTitles.map((t) => t.trim()).filter(Boolean);
  const short = (s: string) => (s.length > 28 ? `${s.slice(0, 27).trimEnd()}…` : s);
  if (titles.length === 0) return "Date";
  if (titles.length === 1) return short(titles[0]);
  return `${short(titles[0])} & ${short(titles[1])}`;
}

export function liveStops(itinerary: Itinerary): ItineraryStop[] {
  return itinerary.stops.filter((s) => s.activity);
}

export function coverImage(itinerary: Itinerary): string {
  for (const stop of itinerary.stops) {
    const url = stop.activity?.image_urls?.[0];
    if (url) return url;
  }
  return FALLBACK_IMAGE;
}

export function stopCountLabel(itinerary: Itinerary): string {
  const n = liveStops(itinerary).length;
  return `${n} ${n === 1 ? "stop" : "stops"}`;
}

export function formatTimeOfDay(value: string | Date): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Sat, Nov 15 · 7:00 PM" */
export function formatWhen(value: string | Date): string {
  const d = new Date(value);
  const day = d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day} · ${formatTimeOfDay(d)}`;
}

/** "Nov 15" (adds the year when it isn't this year) */
export function formatShortDate(value: string | Date): string {
  const d = new Date(value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : {year: "numeric"}),
  });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Tomorrow", "In 3 days", "In 2 weeks" */
export function countdownLabel(value: string | Date, now = new Date()): string {
  const days = Math.round(
    (startOfDay(new Date(value)) - startOfDay(now)) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "In 1 week" : `In ${weeks} weeks`;
}

/** Splits saved dates into what the Profile and Activity tabs show. */
export function groupItineraries(itineraries: Itinerary[], now = Date.now()) {
  const active = itineraries.find((i) => i.status === "ACTIVE") ?? null;
  const upcoming = itineraries
    .filter((i) => i.status === "PLANNED" && new Date(i.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  // A planned date that already ended counts as past, even before the
  // auto-complete on next load marks it COMPLETED
  const past = itineraries
    .filter(
      (i) =>
        i.status === "COMPLETED" ||
        (i.status === "PLANNED" && new Date(i.ends_at).getTime() <= now),
    )
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return {active, upcoming, past};
}

/** The stop happening now (if any) and the next one, by scheduled time. */
export function stopProgress(itinerary: Itinerary, now = Date.now()) {
  const stops = liveStops(itinerary);
  const time = (v: string | null) => (v ? new Date(v).getTime() : NaN);
  const currentIndex = stops.findIndex(
    (s) => time(s.starts_at) <= now && now <= time(s.ends_at),
  );
  const nextIndex = stops.findIndex((s) => time(s.starts_at) > now);
  return {
    stops,
    current: currentIndex >= 0 ? stops[currentIndex] : null,
    next: nextIndex >= 0 ? stops[nextIndex] : null,
    // 1-based position to show as "Stop 2 of 3"
    position:
      currentIndex >= 0
        ? currentIndex + 1
        : nextIndex >= 0
          ? nextIndex + 1
          : stops.length,
  };
}

/**
 * Rebuilds the builder's full timeline (travel legs, trip home, free time)
 * from the saved stops + the prefs used to plan it. Same function the
 * builder uses, so a resumed date looks exactly like it did when finalized.
 */
export function buildTimeline(itinerary: Itinerary): TimeSlot[] | null {
  if (!itinerary.prefs_snapshot) return null;
  const placed = liveStops(itinerary).map((s) => ({activity: s.activity!}));
  if (placed.length === 0) return null;
  return deriveSequentialTimeline(placed, itinerary.prefs_snapshot);
}
