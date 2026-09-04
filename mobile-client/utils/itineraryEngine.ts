// src/utils/itineraryEngine.ts
import {BaseActivity, ScoredActivity, TimeSlot} from "@/types/itinerary";
import {getDistance} from "./geo";
import {UserPrefs} from "@/src/store/usePrefsStore";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PlacedActivity = {
  // THE FIX: No more anchoredAt! The order of the array dictates the time.
  activity: ScoredActivity;
};

export type UI_Trigger = "PROMPT_DINNER" | "PROMPT_LUNCH" | null;

// ─── Pure Helpers ──────────────────────────────────────────────────────────────

export const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

export const snapTo15 = (minutes: number): number => {
  if (minutes <= 0) return 0;
  const remainder = minutes % 15;
  return remainder <= 3 ? minutes - remainder : minutes + (15 - remainder);
};

export const makeGap = (start: number, end: number): TimeSlot => {
  const durationMins = Math.round((end - start) / 60_000);
  const isBuffer = durationMins < 30;

  return {
    id: `gap-${Math.random().toString(36).slice(2, 7)}`,
    title: isBuffer ? "Flex Time" : "Empty",
    startTime: start,
    endTime: end,
    type: isBuffer ? "BUFFER" : "AVAILABLE",
    activity: null,
  };
};

const roundDate = (date: string | Date) => {
  const d = new Date(date);
  const hour = d.getHours();
  const minute = d.getMinutes();
  d.setHours(hour, minute, 0, 0);
  return d;
};

// ─── Core Timeline Deriver (The Canvas) ────────────────────────────────────────

export const deriveSequentialTimeline = (
  placed: PlacedActivity[],
  prefs: UserPrefs,
): TimeSlot[] => {
  const dayStart = roundDate(prefs.startDate).getTime();
  const dayEnd = roundDate(prefs.endDate).getTime();
  const slots: TimeSlot[] = [];

  // Empty state — one big available gap
  if (placed.length === 0) {
    return [makeGap(dayStart, dayEnd)];
  }

  let cursor = dayStart;
  let prevLocation: ScoredActivity | UserPrefs = prefs;

  // 1. Pack everything left-to-right dynamically
  placed.forEach((p, index) => {
    const activity = p.activity;

    // Calculate Travel from previous location
    let travelMs = 0;
    if (prefs.modality === "GO_OUT") {
      const dist = getDistance(prevLocation, activity);
      travelMs = snapTo15(dist > 0 ? dist * 3 + 5 : 0) * 60_000;
    }

    const durationMs =
      snapTo15(Number(activity.est_duration_minutes) || 60) * 60_000;

    // Add Travel Slot (if applicable)
    if (travelMs > 0) {
      slots.push({
        id: `travel-${activity.idea_id}-${index}`,
        title: `Travel & Parking (${getDistance(prevLocation, activity).toFixed(1)} mi)`,
        startTime: cursor,
        endTime: cursor + travelMs,
        type: "OCCUPIED",
        activity: null,
      });
      cursor += travelMs;
    }

    // Add Activity Slot
    slots.push({
      id: `act-${activity.idea_id}-${index}`,
      title: activity.title,
      startTime: cursor,
      endTime: cursor + durationMs,
      type: "OCCUPIED",
      activity: activity,
    });

    cursor += durationMs;
    prevLocation = activity;
  });

  // 2. Return Journey
  if (prefs.modality === "GO_OUT" && placed.length > 0) {
    // Safely grab the last activity directly from the array to keep TypeScript happy
    const lastActivity = placed[placed.length - 1].activity;

    // Pass prefs and lastActivity without any forceful casting
    const dist = getDistance(prefs, lastActivity);

    if (dist > 0) {
      const travelMs = snapTo15(Math.round(dist * 3 + 5)) * 60_000;
      slots.push({
        id: "return-journey",
        title: `Head Home (${dist.toFixed(1)} mi)`,
        startTime: cursor,
        endTime: cursor + travelMs,
        type: "OCCUPIED",
        activity: null,
      });
      cursor += travelMs;
    }
  }

  // 3. Trailing Gap (The remaining time in their schedule)
  if (cursor < dayEnd) {
    slots.push(makeGap(cursor, dayEnd));
  }

  return slots;
};

// ─── Gap Analysis ──────────────────────────────────────────────────────────────

export const hasMeaningfulOverlap = (
  slot: TimeSlot,
  targetStartHour: number,
  targetEndHour: number,
  minOverlapMinutes = 45,
): boolean => {
  const base = new Date(slot.startTime);
  const targetStart = new Date(base).setHours(targetStartHour, 0, 0, 0);
  const targetEnd = new Date(base).setHours(targetEndHour, 0, 0, 0);
  const latestStart = Math.max(slot.startTime, targetStart);
  const earliestEnd = Math.min(slot.endTime, targetEnd);
  return Math.round((earliestEnd - latestStart) / 60_000) >= minOverlapMinutes;
};

export const getAvailableGaps = (timeline: TimeSlot[]) =>
  timeline
    .filter((slot) => slot.type === "AVAILABLE")
    .map((slot) => {
      const durationMins = Math.round((slot.endTime - slot.startTime) / 60_000);
      return {
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: durationMins,
        hasLunchPotential: hasMeaningfulOverlap(slot, 11, 14, 45),
        hasDinnerPotential: hasMeaningfulOverlap(slot, 17, 21, 45),
      };
    })
    .filter((gap) => gap.duration >= 15);

export const canActivityFit = (
  timeline: TimeSlot[],
  activity: BaseActivity,
): boolean => {
  const duration = Number(activity.est_duration_minutes) || 0;
  return getAvailableGaps(timeline).some((gap) => gap.duration >= duration);
};

// ─── Trigger Analysis ──────────────────────────────────────────────────────────

export const analyzeTriggers = (
  timeline: TimeSlot[],
  placedIdeaId: string,
): UI_Trigger => {
  const slot = timeline.find(
    (s) => s.id.startsWith(`act-${placedIdeaId}`) && s.type === "OCCUPIED",
  );
  if (!slot) return null;

  const endHour =
    new Date(slot.endTime).getHours() +
    new Date(slot.endTime).getMinutes() / 60;

  if (endHour >= 17.0 && endHour <= 20.0) {
    const hasDinner = timeline.some(
      (s) =>
        s.activity?.activity_type === "MEAL" &&
        new Date(s.startTime).getHours() >= 16,
    );
    if (!hasDinner) return "PROMPT_DINNER";
  }

  if (endHour >= 11.5 && endHour <= 13.5) {
    const hasLunch = timeline.some(
      (s) =>
        s.activity?.activity_type === "MEAL" &&
        new Date(s.startTime).getHours() < 16,
    );
    if (!hasLunch) return "PROMPT_LUNCH";
  }

  return null;
};

// ─── Scoring ───────────────────────────────────────────────────────────────────

export const scoreActivities = ({
  activities,
  prefs,
  origin,
}: {
  activities: BaseActivity[];
  prefs: UserPrefs;
  origin: ScoredActivity | UserPrefs | null;
}): ScoredActivity[] => {
  if (!activities?.length) return [];

  const budgetPerPerson =
    (Number(prefs.budget) || 0) / (Number(prefs.headCount) || 1);

  const totalAvailableMs =
    new Date(prefs.endDate).getTime() - new Date(prefs.startDate).getTime();

  return activities
    .map((item) => {
      const distance =
        item.modality === "STAY_IN" || prefs.modality === "STAY_IN" || !origin
          ? 0
          : getDistance(origin, item);

      let score = 50;

      if (prefs.vibes && prefs.vibes.length > 0) {
        const matchCount = prefs.vibes.filter((v) =>
          item.tags?.includes(v),
        ).length;
        score += matchCount * 25;
      }

      score -=
        Math.abs((Number(item.est_price_per_person) || 0) - budgetPerPerson) *
        2;

      if (item.modality !== "STAY_IN" && prefs.modality !== "STAY_IN") {
        score += 5 - distance;
      }

      return {
        ...item,
        est_price_per_person: Number(item.est_price_per_person) || 0,
        score,
        distance: parseFloat((distance || 0).toFixed(2)),
      } as ScoredActivity;
    })
    .filter((item) => {
      // --- GATEKEEPER 1: Distance ---
      if (item.modality !== "STAY_IN" && prefs.modality !== "STAY_IN") {
        if (item.distance > prefs.travelDistance) return false;
      }

      // --- GATEKEEPER 2: Time ---
      const durationMs = (Number(item.est_duration_minutes) || 60) * 60_000;
      const travelMs =
        item.modality !== "STAY_IN" && prefs.modality !== "STAY_IN"
          ? snapTo15(item.distance > 0 ? item.distance * 3 + 5 : 0) * 60_000
          : 0;

      if (durationMs + travelMs * 2 > totalAvailableMs) {
        return false;
      }

      return true;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
};

// ─── API Queries ───────────────────────────────────────────────────────────────

const API_HOST = process.env.EXPO_PUBLIC_API_HOST;

type QueryResponse = {
  success: boolean;
  data?: ScoredActivity[];
  retried?: boolean;
  error?: any;
};

// You can use this to fetch the initial batch of activities
export const queryAnchors = async (
  prefs: UserPrefs,
  isRetry = false,
): Promise<QueryResponse> => {
  try {
    const response = await fetch(`${API_HOST}/api/ideas/anchors`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(prefs),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();

    if ((!data || data.length === 0) && !isRetry) {
      console.log(
        "No activities found. Wiping vibes and expanding distance...",
      );
      return queryAnchors(
        {
          ...prefs,
          vibes: [],
          travelDistance:
            prefs.modality === "GO_OUT"
              ? prefs.travelDistance * 2
              : prefs.travelDistance,
        },
        true,
      );
    }

    const rawArray = Array.isArray(data) ? data : [];
    return {
      success: true,
      data: scoreActivities({activities: rawArray, prefs, origin: prefs}),
      retried: isRetry,
    };
  } catch (error) {
    console.error("queryAnchors error:", error);
    return {success: false, error};
  }
};

// You can use this to fetch subsequent activities based on gaps
export const queryFillers = async (
  prefs: UserPrefs,
  minutes: number,
  targetBudget: number,
  origin: ScoredActivity | UserPrefs,
): Promise<QueryResponse> => {
  const targetBudgetPerPerson = targetBudget / (Number(prefs.headCount) || 1);

  const originLat = "latitude" in origin ? origin.latitude : null;
  const originLng = "longitude" in origin ? origin.longitude : null;

  const searchLocation =
    originLat !== null && originLng !== null
      ? {latitude: originLat, longitude: originLng}
      : prefs.currentLocation;

  try {
    const response = await fetch(`${API_HOST}/api/ideas/fill-schedule`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        userId: prefs.userId || null,
        vibes: prefs.vibes || [],
        budget: targetBudgetPerPerson,
        modality: prefs.modality,
        maxDuration: minutes,
        currentLocation: searchLocation,
        travelDistance: prefs.travelDistance,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const rawArray = Array.isArray(data) ? data : data?.data || [];

    return {
      success: true,
      data: scoreActivities({activities: rawArray, prefs, origin}),
    };
  } catch (error) {
    console.error("queryFillers error:", error);
    return {success: false, error, data: []};
  }
};
