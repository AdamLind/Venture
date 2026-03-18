import {Activity, SlotType, TimeSlot, UserPrefs} from "@/types/itinerary";
import {getDistance} from "./geo";

const API_HOST = process.env.EXPO_PUBLIC_API_HOST;

export const createInitialTimeline = (
  startDateIso: string,
  endDateIso: string,
): TimeSlot[] => {
  const startDate = new Date(startDateIso);
  const endDate = new Date(endDateIso);

  // CRITICAL FIX: Strip seconds and milliseconds
  startDate.setSeconds(0, 0);
  endDate.setSeconds(0, 0);

  const start = new Date(startDateIso).getTime();
  const end = new Date(endDateIso).getTime();

  if (isNaN(start) || isNaN(end)) {
    console.error("Invalid dates provided to initializeTimeline");
    return [];
  }

  return [
    {
      id: "initial-gap",
      title: "Initial Gap",
      startTime: start,
      endTime: end,
      type: "AVAILABLE",
      activity: null,
    },
  ];
};

export const fragmentSlot = (
  timeline: TimeSlot[],
  targetSlotId: string,
  activity: Activity,
  startTime: number,
  prefs: UserPrefs,
): TimeSlot[] => {
  return timeline.flatMap((slot, index) => {
    if (slot.id !== targetSlotId) return slot;

    // --- 1. LOOK BACK (Inbound Travel) ---
    const previousSlot = timeline[index - 1];
    const inboundOrigin = previousSlot?.activity || prefs;
    const inboundDistance = getDistance(inboundOrigin, activity);

    const inboundTravelMins =
      inboundDistance > 0 ? Math.round(inboundDistance * 3 + 5) : 0;
    const inboundTravelMs = inboundTravelMins * 60 * 1000;

    // --- 2. LOOK FORWARD (Outbound Travel) ---
    // This is the "Forward Compatibility" part
    const nextSlot = timeline[index + 1];
    let outboundTravelMs = 0;
    let outboundDistance = 0;

    if (nextSlot?.activity) {
      outboundDistance = getDistance(activity, nextSlot.activity);
      const outboundMins =
        outboundDistance > 0 ? Math.round(outboundDistance * 3 + 5) : 0;
      outboundTravelMs = outboundMins * 60 * 1000;
    }

    // --- 3. VALIDATION ---
    const activityDurationMs =
      (Number(activity.est_duration_minutes) || 60) * 60 * 1000;

    // The "Total Block" now considers BOTH travel legs if filling a middle gap
    const totalBlockEnd =
      startTime + inboundTravelMs + activityDurationMs + outboundTravelMs;

    if (startTime < slot.startTime || totalBlockEnd > slot.endTime + 1000) {
      console.warn("Activity + All Travel doesn't fit the gap!");
      return slot;
    }

    const newSlots: TimeSlot[] = [];

    // --- 4. CONSTRUCT THE FRAGMENTS ---
    // A. Pre-gap
    if (startTime > slot.startTime) {
      newSlots.push({
        id: `gap-${Math.random().toString(36).slice(2, 7)}`,
        title: "Empty",
        startTime: slot.startTime,
        endTime: startTime,
        type: "AVAILABLE",
      });
    }

    // B. Inbound Travel
    if (inboundTravelMs > 0) {
      newSlots.push({
        id: `travel-${Math.random().toString(36).slice(2, 7)}`,
        title: `🚗 Travel (${inboundDistance.toFixed(1)} mi)`,
        startTime: startTime,
        endTime: startTime + inboundTravelMs,
        type: "OCCUPIED",
      });
    }

    // C. The Activity
    newSlots.push({
      id: `act-${activity.idea_id}-${Math.random().toString(36).slice(2, 7)}`,
      title: activity.title,
      startTime: startTime + inboundTravelMs,
      endTime: startTime + inboundTravelMs + activityDurationMs,
      type: "OCCUPIED",
      activity: activity,
    });

    // D. Outbound Travel (Future-Proofed)
    if (outboundTravelMs > 0) {
      newSlots.push({
        id: `travel-${Math.random().toString(36).slice(2, 7)}`,
        title: `🚗 Travel (${outboundDistance.toFixed(1)} mi)`,
        startTime: startTime + inboundTravelMs + activityDurationMs,
        endTime: totalBlockEnd,
        type: "OCCUPIED",
      });
    }

    // E. Post-gap
    if (totalBlockEnd < slot.endTime) {
      newSlots.push({
        id: `gap-${Math.random().toString(36).slice(2, 7)}`,
        title: "Empty",
        startTime: totalBlockEnd,
        endTime: slot.endTime,
        type: "AVAILABLE",
      });
    }

    return newSlots;
  });
};

export const consolidateGaps = (timeline: TimeSlot[]): TimeSlot[] => {
  if (timeline.length <= 1) return timeline;

  const result: TimeSlot[] = [];

  for (const current of timeline) {
    const last = result[result.length - 1];

    // If the last slot in our result is AVAILABLE and the current one is also AVAILABLE...
    if (last && last.type === "AVAILABLE" && current.type === "AVAILABLE") {
      // "Melt" them together by extending the last one's end time
      result[result.length - 1] = {
        ...last,
        endTime: current.endTime,
      };
      // We don't push 'current' because it's now part of 'last'
    } else {
      result.push({...current}); // Otherwise, just add the slot as is
    }
  }

  return result;
};

/**
 * Removes an activity from the timeline and resets the slot to AVAILABLE.
 * Then, it automatically merges the newly created gap with any touching gaps.
 */
export const removeActivity = (
  timeline: TimeSlot[],
  slotId: string,
): TimeSlot[] => {
  // 1. Find the slot and turn it back into a Gap
  const updated = timeline.map((slot): TimeSlot => {
    if (slot.id !== slotId) return slot;

    return {
      ...slot,
      type: "AVAILABLE",
      activity: null, // Clear the data
    };
  });

  // 2. Run the Cleanup Crew to merge touching gaps
  return consolidateGaps(updated);
};

export const updateTimeline = (
  currentTimeline: TimeSlot[],
  action: {type: "ADD" | "REMOVE"; payload: any},
): TimeSlot[] => {
  let nextTimeline: TimeSlot[] = [];

  switch (action.type) {
    case "ADD":
      nextTimeline = fragmentSlot(
        currentTimeline,
        action.payload.targetId,
        action.payload.activity,
        action.payload.startTime,
        action.payload.prefs,
      );
      break;

    case "REMOVE":
      nextTimeline = removeActivity(currentTimeline, action.payload.slotId);
      break;

    default:
      return currentTimeline;
  }

  // Final Safety Check: Always consolidate before returning to the UI
  return consolidateGaps(nextTimeline);
};

const scoreAnchors = ({
  allAnchors,
  prefs,
}: {
  allAnchors: any[];
  prefs: UserPrefs;
}) => {
  if (!allAnchors || allAnchors.length === 0) return null;

  const userBudget = Number(prefs.budget) || 0;
  const heads = Number(prefs.headCount) || 1;
  const budgetPerPerson = userBudget / heads;

  return allAnchors
    .map((anchor) => {
      // Calculate distance once here
      const distance =
        anchor.activity_type === "STAY_IN" || !prefs.currentLocation
          ? 0
          : getDistance(prefs, anchor);

      let score = 50;

      // Vibe Match
      if (anchor.tags?.includes(prefs.vibe)) score += 40;

      // Budget Match
      const anchorPrice = Number(anchor.est_price_per_person) || 0;
      const priceDiff = Math.abs(anchorPrice - budgetPerPerson);
      score -= priceDiff * 2;

      // Distance "Freshness"
      if (anchor.activity_type !== "STAY_IN") {
        score += 5 - distance;
      }

      // ATTACH DISTANCE HERE
      return {
        ...anchor,
        est_price_per_person: anchorPrice,
        score,
        distance: parseFloat(distance.toFixed(2)),
      };
    })
    .filter((anchor) => {
      // Filter based on the distance we just attached
      if (anchor.activity_type === "STAY_IN") return true;
      return anchor.distance <= prefs.travelDistance;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
};

export const queryAnchors = async (
  prefs: UserPrefs,
  isRetry = false,
): Promise<any> => {
  try {
    const response = await fetch(`${API_HOST}/api/ideas/anchors`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(prefs),
    });

    const data = await response.json(); // This is the raw array from the server

    // 1. IF NO RESULTS FOUND (The "Phase" Fallback)
    if ((!data || data.length === 0) && !isRetry) {
      const broaderPrefs = {
        ...prefs,
        vibe: null,
        travelDistance: prefs.travelDistance * 2,
      };

      // STOP HERE: Return the result of the second call directly
      return await queryAnchors(broaderPrefs, true);
    }

    // 2. DATA PROCESSING
    // Ensure we have an array. If the server returned an error object, fallback to []
    const rawArray = Array.isArray(data) ? data : [];

    const scored = scoreAnchors({allAnchors: rawArray, prefs});

    // 3. FINAL RETURN
    return {
      success: true,
      data: scored, // This is your scored and sorted array
      retried: isRetry,
    };
  } catch (error) {
    console.error("Fetch Error:", error);
    return {success: false, error};
  }
};

export const scheduleFillers = async (
  prefs: UserPrefs,
  minutes: number,
  budget: number,
) => {
  const budgetPerPerson = budget / prefs.headCount;

  try {
    const response = await fetch(
      `${API_HOST}/api/ideas/fill-schedule?vibe=cozy&budget=${budgetPerPerson}&type=${prefs.locationType}&minutes=${minutes}`,
    );
    const data = await response.json();
    return data;
  } catch (error) {
    return {success: false, error};
  }
};

export const getGapAnalysis = (timeline: TimeSlot[]) => {
  return timeline
    .filter((slot) => slot.type === "AVAILABLE")
    .map((slot) => {
      const durationMs = slot.endTime - slot.startTime;
      const durationMins = Math.round(durationMs / 60000); // Use Math.round here!

      // Create a Date object from the START of the gap to check the hour
      const startDate = new Date(slot.startTime);
      const startHour = startDate.getHours(); // 0-23

      let suggestedCategory = "GENERAL";

      // Logic based on actual clock hours (e.g., 11 AM to 2 PM)
      if (startHour >= 11 && startHour <= 14) suggestedCategory = "LUNCH";
      if (startHour >= 17 && startHour <= 21) suggestedCategory = "DINNER";
      if (durationMins < 45) suggestedCategory = "SNACK_OR_DRINK";

      return {
        slotId: slot.id,
        duration: durationMins,
        startTime: slot.startTime,
        suggestedCategory,
      };
    })
    .filter((gap) => gap.duration >= 15);
};
