// src/utils/autoPlanner.ts
import { ScoredActivity, TimeSlot } from "@/types/itinerary";
import { UserPrefs } from "@/store/usePrefsStore";
import { getDistance } from "./geo";
import { snapTo15 } from "./itineraryEngine"; // Assuming snapTo15 remains in itineraryEngine

// ─── Types ─────────────────────────────────────────────────────────────────────

// We create a specific type for the premium engine because it still cares about 'anchoredAt'
export type PremiumPlacedActivity = {
  activity: ScoredActivity;
  anchoredAt?: number; // Unix ms — set only on the anchor; undefined for fillers
};

// ─── Internal Helpers (Isolated for the Premium Engine) ────────────────────────

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

// ─── The Brain: Optimal Anchor Placement ───────────────────────────────────────

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

// ─── The Brain: Complex Algorithmic Timeline Deriver ───────────────────────────

export const derivePremiumTimeline = (
  placed: PremiumPlacedActivity[],
  prefs: UserPrefs,
): TimeSlot[] => {
  const dayStart = roundDate(prefs.startDate).getTime();
  const dayEnd = roundDate(prefs.endDate).getTime();

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

  for (const { activity } of postActivities) {
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

// ─── Future Feature: 1-Tap Magic Planner ───────────────────────────────────────
/*
export const generatePremiumNightOut = async (
  prefs: UserPrefs,
): Promise<ScoredActivity[]> => {
  // 1. Query DB for best Anchor based on vibes/budget
  // 2. Call getOptimalAnchorTime(anchor, prefs)
  // 3. Query DB for pre-fillers and post-fillers
  // 4. Arrange them optimally
  // 5. Flatten into a simple chronological array: [PreFiller, Anchor, PostFiller]
  // 6. Return to UI to be rendered by the manual 'deriveSequentialTimeline'
  return [];
};
*/