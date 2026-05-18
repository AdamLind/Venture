import {BaseActivity, ScoredActivity, TimeSlot} from "@/types/itinerary";
import {getDistance} from "./geo";
import {UserPrefs} from "@/store/usePrefsStore";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PlacedActivity = {
  activity: ScoredActivity; // THE FIX: Placed activities MUST be scored to be on the timeline!
  anchoredAt?: number; // Unix ms — set only on the anchor; undefined for fillers
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

const makeGap = (start: number, end: number): TimeSlot => {
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

/**
 * Returns travel duration in ms between two locations.
 * Returns 0 if the user is staying in, or if the distance is zero.
 */
const getTravelMs = (
  from: ScoredActivity | UserPrefs,
  to: ScoredActivity,
  prefs: UserPrefs,
): number => {
  if (prefs.modality === "STAY_IN") return 0;
  const dist = getDistance(from, to);
  return snapTo15(dist > 0 ? dist * 3 + 5 : 0) * 60_000;
};

const getTravelLabel = (
  from: ScoredActivity | UserPrefs,
  to: ScoredActivity,
  prefs: UserPrefs,
): string => {
  const dist = getDistance(from, to);
  return `Travel & Parking (${dist.toFixed(1)} mi)`;
};

const roundDate = (date: string | Date) => {
  const d = new Date(date);
  const hour = d.getHours();
  const minute = d.getMinutes();
  d.setHours(hour, minute, 0, 0);
  return d;
};

// ─── Optimal Anchor Placement ────────────────────────────────────────────────

export const getOptimalAnchorTime = (
  activity: ScoredActivity,
  prefs: UserPrefs,
): number => {
  const dayStart = new Date(prefs.startDate).getTime();
  const dayEnd = new Date(prefs.endDate).getTime();

  const durationMs =
    snapTo15(Number(activity.est_duration_minutes) || 60) * 60_000;

  // Estimate the travel time (drive there + drive back)
  const travelMs = getTravelMs(prefs, activity, prefs);

  // The absolute boundaries: we must leave room for travel TO and FROM the anchor
  const earliestStart = dayStart + travelMs;
  const latestStart = dayEnd - durationMs - travelMs;

  const setHour = (hour: number, minute = 0): number => {
    const d = new Date(dayStart);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  };

  let candidateTime: number;

  if (activity.activity_type === "MEAL") {
    const dinner = setHour(18, 30);
    const lunch = setHour(12, 30);

    // Check if preferred meal times fit inside the safe zone
    if (dinner >= earliestStart && dinner <= latestStart) {
      candidateTime = dinner;
    } else if (lunch >= earliestStart && lunch <= latestStart) {
      candidateTime = lunch;
    } else {
      // Fallback: put it perfectly in the middle of the safe window
      const window = Math.max(0, latestStart - earliestStart);
      candidateTime = earliestStart + Math.floor(window / 2);
    }
  } else {
    // Place 1/3 into the SAFE window, snapped to 15 mins
    const window = Math.max(0, latestStart - earliestStart);
    const raw = earliestStart + Math.floor(window / 3);
    const ms15 = 15 * 60_000;
    candidateTime = Math.round(raw / ms15) * ms15;
  }

  // Final strict clamp: The anchor CANNOT start earlier or later than the safe zone
  return Math.max(earliestStart, Math.min(candidateTime, latestStart));
};

// ─── Core Timeline Deriver ─────────────────────────────────────────────────────

export const deriveTimeline = (
  placed: PlacedActivity[],
  prefs: UserPrefs,
): TimeSlot[] => {
  const dayStart = roundDate(prefs.startDate).getTime();
  const dayEnd = roundDate(prefs.endDate).getTime();
  const GAP_ABSORB_MS = 30 * 60_000;

  // Empty state — one big available gap
  if (placed.length === 0) {
    return [makeGap(dayStart, dayEnd)];
  }

  const anchorIndex = placed.findIndex((p) => p.anchoredAt != null);
  if (anchorIndex === -1) {
    // No anchor yet; shouldn't occur in normal flow
    return [makeGap(dayStart, dayEnd)];
  }

  const anchor = placed[anchorIndex];
  const anchorStart = anchor.anchoredAt!;
  const anchorDurationMs =
    snapTo15(Number(anchor.activity.est_duration_minutes) || 60) * 60_000;
  const anchorEnd = anchorStart + anchorDurationMs;

  const preActivities = placed.slice(0, anchorIndex);
  const postActivities = placed.slice(anchorIndex + 1);

  const slots: TimeSlot[] = [];

  // ── PRE-ANCHOR: build right-to-left ─────────────────────────────────────────
  const anchorOrigin: ScoredActivity | UserPrefs =
    preActivities.length > 0
      ? preActivities[preActivities.length - 1].activity
      : prefs;
  const anchorInboundMs = getTravelMs(anchorOrigin, anchor.activity, prefs);

  let preRight = anchorStart - anchorInboundMs;
  const preSlots: TimeSlot[] = [];

  for (let i = preActivities.length - 1; i >= 0; i--) {
    const curr = preActivities[i].activity;
    const prev: ScoredActivity | UserPrefs =
      i > 0 ? preActivities[i - 1].activity : prefs;

    const durationMs =
      snapTo15(Number(curr.est_duration_minutes) || 60) * 60_000;
    const travelMs = getTravelMs(prev, curr, prefs);

    const actEnd = preRight;
    const actStart = actEnd - durationMs;
    const travelEnd = actStart;
    const travelStart = travelEnd - travelMs;

    // Activity
    preSlots.unshift({
      id: `act-${curr.idea_id}`,
      title: curr.title,
      startTime: actStart,
      endTime: actEnd,
      type: "OCCUPIED",
      activity: curr,
    });

    // Inbound travel for this pre-filler
    if (travelMs > 0) {
      preSlots.unshift({
        id: `travel-${curr.idea_id}`,
        title: getTravelLabel(prev, curr, prefs),
        startTime: travelStart,
        endTime: travelEnd,
        type: "OCCUPIED",
        activity: null,
      });
    }

    preRight = travelStart;
  }

  // Pre-gap
  const preBlockStart =
    preSlots.length > 0 ? preSlots[0].startTime : anchorStart - anchorInboundMs;

  if (preBlockStart > dayStart) {
    slots.push(makeGap(dayStart, preBlockStart));
  }

  slots.push(...preSlots);

  // Anchor inbound travel
  if (anchorInboundMs > 0) {
    slots.push({
      id: `travel-${anchor.activity.idea_id}`,
      title: getTravelLabel(anchorOrigin, anchor.activity, prefs),
      startTime: anchorStart - anchorInboundMs,
      endTime: anchorStart,
      type: "OCCUPIED",
      activity: null,
    });
  }

  // Anchor
  slots.push({
    id: `act-${anchor.activity.idea_id}`,
    title: anchor.activity.title,
    startTime: anchorStart,
    endTime: anchorEnd,
    type: "OCCUPIED",
    activity: anchor.activity,
  });

  // ── POST-ANCHOR: build left-to-right ─────────────────────────────────────────
  let postCursor = anchorEnd;
  let prevLocation: ScoredActivity | UserPrefs = anchor.activity;

  for (const {activity} of postActivities) {
    const travelMs = getTravelMs(prevLocation, activity, prefs);
    const durationMs =
      snapTo15(Number(activity.est_duration_minutes) || 60) * 60_000;

    if (travelMs > 0) {
      slots.push({
        id: `travel-${activity.idea_id}`,
        title: getTravelLabel(prevLocation, activity, prefs),
        startTime: postCursor,
        endTime: postCursor + travelMs,
        type: "OCCUPIED",
        activity: null,
      });
    }

    slots.push({
      id: `act-${activity.idea_id}`,
      title: activity.title,
      startTime: postCursor + travelMs,
      endTime: postCursor + travelMs + durationMs,
      type: "OCCUPIED",
      activity,
    });

    postCursor += travelMs + durationMs;
    prevLocation = activity;
  }

  // ── RETURN JOURNEY ────────────────────────────────────────────────────────────
  if (prefs.modality === "GO_OUT") {
    const dist = getDistance(prefs, prevLocation as ScoredActivity);
    if (dist > 0) {
      const travelMs = snapTo15(Math.round(dist * 3 + 5)) * 60_000;
      slots.push({
        id: "return-journey",
        title: `Head Home (${dist.toFixed(1)} mi)`,
        startTime: postCursor,
        endTime: postCursor + travelMs,
        type: "OCCUPIED",
        activity: null,
      });
      postCursor += travelMs;
    }
  }

  // ── TRAILING GAP ──────────────────────────────────────────────────────────────
  if (postCursor < dayEnd) {
    slots.push(makeGap(postCursor, dayEnd));
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
  activity: BaseActivity, // Any activity, scored or raw, can be checked for time fit
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
    (s) => s.id === `act-${placedIdeaId}` && s.type === "OCCUPIED",
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

// ─── Scoring ───────────────────────────────────────────────────────────────────

const scoreActivities = ({
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

  // 1. Calculate the absolute total time the user has for this date
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

      // Calculate travel time (using the exact same formula from your getTravelMs helper)
      const travelMs =
        item.modality !== "STAY_IN" && prefs.modality !== "STAY_IN"
          ? snapTo15(item.distance > 0 ? item.distance * 3 + 5 : 0) * 60_000
          : 0;

      // Does the activity duration + a round trip physically fit in their time window?
      // If not, instantly kill it.
      if (durationMs + travelMs * 2 > totalAvailableMs) {
        return false;
      }

      return true;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
};

// ─── API Queries ───────────────────────────────────────────────────────────────

const API_HOST = process.env.EXPO_PUBLIC_API_HOST;

// THE FIX: Define strict return types for your queries so the UI Builder knows what it gets
type QueryResponse = {
  success: boolean;
  data?: ScoredActivity[];
  retried?: boolean;
  error?: any;
};

export const queryAnchors = async (
  prefs: UserPrefs, // Make sure UserPrefs includes `userId` and `vibes: string[]`
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

    // The Retry Fallback: If no activities match their exact vibes, widen the net.
    if ((!data || data.length === 0) && !isRetry) {
      console.log(
        "No anchors found. Wiping vibes and expanding distance for retry...",
      );
      return queryAnchors(
        {
          ...prefs,
          vibes: [], // Clear the array instead of using an empty string
          // Only expand the search radius if they are actually leaving the house
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

export const queryFillers = async (
  prefs: UserPrefs,
  minutes: number,
  budget: number,
  origin: ScoredActivity | UserPrefs,
): Promise<QueryResponse> => {
  // Budget passed here is the remaining budget for this timeline slot
  const budgetPerPerson = budget / (Number(prefs.headCount) || 1);

  // Extract the coordinates of the previous activity so we find a filler nearby.
  // If the previous activity was STAY_IN (null coords), fallback to their home base.
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
        vibes: prefs.vibes || [], // Pass our new array!
        budget: budgetPerPerson,
        modality: prefs.modality,
        maxDuration: minutes, // The time gap we need to fill
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
