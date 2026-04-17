import {Activity, SlotType, TimeSlot, UserPrefs} from "@/types/itinerary";
import {getDistance} from "./geo";

const API_HOST = process.env.EXPO_PUBLIC_API_HOST;

export const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true, // Forces AM/PM
  });
};

export const createInitialTimeline = (
  startDateInput: string | Date | number,
  endDateInput: string | Date | number,
): TimeSlot[] => {
  // JavaScript's new Date() handles strings, Dates, and Unix timestamps automatically
  const startDate = new Date(startDateInput);
  const endDate = new Date(endDateInput);

  // CRITICAL FIX: Strip seconds and milliseconds
  startDate.setSeconds(0, 0);
  endDate.setSeconds(0, 0);

  const start = startDate.getTime();
  const end = endDate.getTime();

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

    // --- NEW: INTELLIGENT LOCATION FINDERS ---
    // Look backwards to find the actual last physical location
    let previousActivity = null;
    for (let i = index - 1; i >= 0; i--) {
      if (timeline[i].activity) {
        previousActivity = timeline[i].activity;
        break;
      }
    }

    // Look forwards to find the next actual physical location
    let nextActivity = null;
    for (let i = index + 1; i < timeline.length; i++) {
      if (timeline[i].activity) {
        nextActivity = timeline[i].activity;
        break;
      }
    }

    // --- 1. LOOK BACK (Inbound Travel) ---
    // Use the previous activity, or fallback to Home (prefs) if it's the first activity of the day
    const inboundOrigin = previousActivity || prefs;

    // (Also updated locationType to modality here since you changed your frontend terminology!)
    const inboundDistance =
      prefs.modality === "GO_OUT" ? getDistance(inboundOrigin, activity) : 0;

    const inboundTravelMins =
      inboundDistance > 0 ? Math.round(inboundDistance * 3 + 5) : 0;
    const inboundTravelMs = inboundTravelMins * 60 * 1000;

    // --- 2. LOOK FORWARD (Outbound Travel) ---
    let outboundTravelMs = 0;
    let outboundDistance = 0;

    if (nextActivity) {
      outboundDistance = getDistance(activity, nextActivity);
      const outboundMins =
        outboundDistance > 0 ? Math.round(outboundDistance * 3 + 5) : 0;
      outboundTravelMs = outboundMins * 60 * 1000;
    }

    // --- 3. VALIDATION ---
    const activityDurationMs =
      (Number(activity.est_duration_minutes) || 60) * 60 * 1000;

    const totalBlockEnd =
      startTime + inboundTravelMs + activityDurationMs + outboundTravelMs;

    if (startTime < slot.startTime || totalBlockEnd > slot.endTime + 1000) {
      console.warn("Activity + All Travel doesn't fit the gap!");
      return slot;
    }

    const newSlots: TimeSlot[] = [];

    // --- 4. CONSTRUCT THE FRAGMENTS ---
    // Create ONE unique ID for this block to link travel slots to the activity
    const blockId = `act-${activity.idea_id}-${Math.random().toString(36).slice(2, 7)}`;

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

    // B. Inbound Travel (Linked via blockId)
    if (inboundTravelMs > 0) {
      newSlots.push({
        id: `travel-in-${blockId}`,
        title: `🚗 Travel (${inboundDistance.toFixed(1)} mi)`,
        startTime: startTime,
        endTime: startTime + inboundTravelMs,
        type: "OCCUPIED",
      });
    }

    // C. The Activity (Linked via blockId)
    newSlots.push({
      id: blockId,
      title: activity.title,
      startTime: startTime + inboundTravelMs,
      endTime: startTime + inboundTravelMs + activityDurationMs,
      type: "OCCUPIED",
      activity: activity,
    });

    // D. Post-gap
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

export const absorbSmallGaps = (timeline: TimeSlot[]): TimeSlot[] => {
  let updated = [...timeline];
  let didChange = true;

  // We use a while loop because array indexes shift when we delete things
  while (didChange) {
    didChange = false;

    for (let i = 0; i < updated.length; i++) {
      const slot = updated[i];
      const durationMins = Math.round((slot.endTime - slot.startTime) / 60000);

      // If we find an annoying micro-gap (30 mins or less)
      if (slot.type === "AVAILABLE" && durationMins <= 30 && durationMins > 0) {
        // Find the closest actual activity BEFORE this gap
        const prevActivityIdx = updated
          .slice(0, i)
          .findLastIndex((s) => s.type === "OCCUPIED" && s.activity !== null);

        if (prevActivityIdx !== -1) {
          const timeToAdd = slot.endTime - slot.startTime;

          // 1. Extend that previous activity to consume the gap
          updated[prevActivityIdx].endTime += timeToAdd;

          // 2. Shift any intermediate slots (like the drive to the next place) forward
          for (let j = prevActivityIdx + 1; j < i; j++) {
            updated[j].startTime += timeToAdd;
            updated[j].endTime += timeToAdd;
          }

          // 3. Vaporize the gap
          updated.splice(i, 1);
          didChange = true;
          break; // Break the 'for' loop and restart the 'while' loop cleanly
        }
      }
    }
  }

  // Final safety sweep to merge any remaining large gaps
  return consolidateGaps(updated);
};

export const packTimeline = (
  timeline: TimeSlot[],
  prefs: UserPrefs,
): TimeSlot[] => {
  // 1. Extract only the actual physical activities in their current chronological order
  const plannedActivities = timeline
    // THE FIX: Using !!slot.activity ensures it rejects both null AND undefined
    .filter((slot) => slot.type === "OCCUPIED" && !!slot.activity)
    .map((slot) => slot.activity!);

  // If the timeline is empty, just return a fresh initial gap
  if (plannedActivities.length === 0) {
    return createInitialTimeline(prefs.startDate, prefs.endDate);
  }

  // ... (The rest of the function stays exactly the same)

  // 2. Start with a completely blank canvas
  let packedTimeline = createInitialTimeline(prefs.startDate, prefs.endDate);

  // 3. Re-insert the activities one by one
  // Because we always target the first gap, they will perfectly snap back-to-back!
  for (const activity of plannedActivities) {
    const gaps = getAvailableGaps(packedTimeline);

    // Grab the very first available gap at the front of the timeline
    const firstGap = gaps[0];

    packedTimeline = updateTimeline(
      packedTimeline,
      {
        type: "ADD",
        payload: {
          targetId: firstGap.slotId,
          activity: activity,
          startTime: firstGap.startTime,
          prefs: prefs,
        },
      },
      prefs,
    );
  }

  return packedTimeline;
};

/**
 * Removes an activity from the timeline and resets the slot to AVAILABLE.
 * Then, it automatically merges the newly created gap with any touching gaps.
 */
export const removeActivity = (
  timeline: TimeSlot[],
  slotId: string, // e.g., 'act-123-abcde'
): TimeSlot[] => {
  // 1. Find the activity AND its connected travel slots
  const updated = timeline.map((slot): TimeSlot => {
    // Check if the slot IS the activity, or if it is a travel slot FOR the activity
    if (
      slot.id === slotId ||
      slot.id === `travel-in-${slotId}` ||
      slot.id === `travel-out-${slotId}`
    ) {
      return {
        ...slot,
        type: "AVAILABLE",
        activity: null, // Clear the data
        title: "Empty", // Clear the "🚗 Travel" text so the UI looks clean
      };
    }
    return slot;
  });

  // 2. Run the Cleanup Crew to melt the newly freed gaps together
  return consolidateGaps(updated);
};

export const updateTimeline = (
  currentTimeline: TimeSlot[],
  action: {type: "ADD" | "REMOVE"; payload: any},
  prefs: UserPrefs, // <--- NEW: Require prefs for every update
): TimeSlot[] => {
  let nextTimeline: TimeSlot[] = [];

  switch (action.type) {
    case "ADD":
      nextTimeline = fragmentSlot(
        currentTimeline,
        action.payload.targetId,
        action.payload.activity,
        action.payload.startTime,
        prefs, // Use the top-level prefs
      );
      break;

    case "REMOVE":
      nextTimeline = removeActivity(currentTimeline, action.payload.slotId);
      break;

    default:
      return currentTimeline;
  }

  // Step 1: Melt touching gaps together
  let polishedTimeline = consolidateGaps(nextTimeline);

  // Step 2: Expand activities to eat up the awkward micro-gaps
  polishedTimeline = absorbSmallGaps(polishedTimeline);

  // Step 3: Append the drive home
  return appendReturnJourney(polishedTimeline, prefs);
};

const scoreAnchors = ({
  allAnchors,
  prefs,
}: {
  allAnchors: any[];
  prefs: UserPrefs;
}) => {
  // FIX: Return an empty array instead of null
  if (!allAnchors || allAnchors.length === 0) return [];

  const userBudget = Number(prefs.budget) || 0;
  const heads = Number(prefs.headCount) || 1;
  const budgetPerPerson = userBudget / heads;

  return allAnchors
    .map((anchor) => {
      // Calculate distance once here
      const distance =
        anchor.modality === "STAY_IN" || !prefs.currentLocation
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
      if (anchor.modality !== "STAY_IN") {
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
      if (anchor.modality === "STAY_IN") return true;
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
    // 1. IF NO RESULTS FOUND
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
      `${API_HOST}/api/ideas/fill-schedule?vibe=cozy&budget=${budgetPerPerson}&type=${prefs.modality}&minutes=${minutes}`,
    );
    const data = await response.json();
    return data;
  } catch (error) {
    return {success: false, error};
  }
};

export const appendReturnJourney = (
  timeline: TimeSlot[],
  prefs: UserPrefs,
): TimeSlot[] => {
  // 1. If staying in, strip any existing return journeys and exit early
  if (prefs.modality === "STAY_IN") {
    return consolidateGaps(
      timeline.filter((slot) => slot.id !== "return-journey"),
    );
  }

  // 2. Strip the old return journey so we can calculate a fresh one
  const baseTimeline = timeline.filter((slot) => slot.id !== "return-journey");

  // 3. Find the last actual activity in the timeline
  const lastActivityIndex = baseTimeline.findLastIndex(
    (slot) => slot.type === "OCCUPIED" && slot.activity !== null,
  );

  // If there are no activities yet, just return the empty timeline
  if (lastActivityIndex === -1) return consolidateGaps(baseTimeline);

  const lastSlot = baseTimeline[lastActivityIndex];

  if (!lastSlot.activity) return consolidateGaps(baseTimeline);

  // 4. Calculate the distance and time home
  const distanceHome = getDistance(prefs, lastSlot.activity);
  if (distanceHome <= 0) return consolidateGaps(baseTimeline);

  const travelMins = Math.round(distanceHome * 3 + 5);
  const travelMs = travelMins * 60 * 1000;

  // 5. Create the Return Slot
  const returnSlot: TimeSlot = {
    id: "return-journey",
    title: `🚗 Head Home (${distanceHome.toFixed(1)} mi)`,
    startTime: lastSlot.endTime,
    endTime: lastSlot.endTime + travelMs,
    type: "OCCUPIED",
    activity: null,
  };

  // 6. Re-stitch the timeline
  // Take everything up to and including the last activity
  const newTimeline = baseTimeline.slice(0, lastActivityIndex + 1);

  // Append the drive home
  newTimeline.push(returnSlot);

  // 7. Calculate the final remaining gap (if any)
  // We need to preserve the absolute end limit of the user's 10-hour tape
  const absoluteEndLimit = baseTimeline[baseTimeline.length - 1].endTime;

  if (returnSlot.endTime < absoluteEndLimit) {
    newTimeline.push({
      id: `gap-${Math.random().toString(36).slice(2, 7)}`,
      title: "Empty",
      startTime: returnSlot.endTime,
      endTime: absoluteEndLimit,
      type: "AVAILABLE",
    });
  }

  return consolidateGaps(newTimeline);
};

// --- 1. THE MATH HELPER ---
export const hasMeaningfulOverlap = (
  slot: TimeSlot,
  targetStartHour: number,
  targetEndHour: number,
  minOverlapMinutes: number = 45,
): boolean => {
  const targetStart = new Date(slot.startTime).setHours(
    targetStartHour,
    0,
    0,
    0,
  );
  const targetEnd = new Date(slot.startTime).setHours(targetEndHour, 0, 0, 0);

  const latestStart = Math.max(slot.startTime, targetStart);
  const earliestEnd = Math.min(slot.endTime, targetEnd);

  const overlapDurationMins = Math.round((earliestEnd - latestStart) / 60000);
  return overlapDurationMins >= minOverlapMinutes;
};

// --- 2. THE CORE ANALYZER ---
export const getAvailableGaps = (timeline: TimeSlot[]) => {
  return timeline
    .filter((slot) => slot.type === "AVAILABLE")
    .map((slot) => {
      const durationMins = Math.round((slot.endTime - slot.startTime) / 60000);

      return {
        slotId: slot.id,
        startTime: slot.startTime,
        duration: durationMins,
        // Tag it if it has at least 45 mins of prime meal time
        hasLunchPotential: hasMeaningfulOverlap(slot, 11, 14, 45),
        hasDinnerPotential: hasMeaningfulOverlap(slot, 17, 21, 45),
      };
    })
    .filter((gap) => gap.duration >= 15); // Drop useless micro-gaps
};

// --- 3. THE UI HELPERS ---
export const canActivityFit = (
  timeline: TimeSlot[],
  activity: Activity,
): boolean => {
  const activityDuration = Number(activity.est_duration_minutes) || 0;
  const gaps = getAvailableGaps(timeline);
  return gaps.some((gap) => gap.duration >= activityDuration);
};

// --- 4. THE CO-PILOT TRIGGER ---
export type UI_Trigger = "PROMPT_DINNER" | "PROMPT_LUNCH" | null;

export const analyzeTriggers = (
  timeline: TimeSlot[],
  targetSlotId: string,
): UI_Trigger => {
  // Find what we just placed
  const newlyPlacedSlot = timeline.find(
    (s) => s.id === targetSlotId && s.type === "OCCUPIED",
  );
  if (!newlyPlacedSlot) return null;

  const endHourDecimal =
    new Date(newlyPlacedSlot.endTime).getHours() +
    new Date(newlyPlacedSlot.endTime).getMinutes() / 60;

  // Did it end right around dinner time (5 PM - 8 PM)?
  if (endHourDecimal >= 17.0 && endHourDecimal <= 20.0) {
    const hasDinner = timeline.some(
      (s) =>
        s.activity?.activity_type === "MEAL" &&
        new Date(s.startTime).getHours() >= 16,
    );
    if (!hasDinner) return "PROMPT_DINNER";
  }

  // Did it end right around lunch time (11:30 AM - 1:30 PM)?
  if (endHourDecimal >= 11.5 && endHourDecimal <= 13.5) {
    const hasLunch = timeline.some(
      (s) =>
        s.activity?.activity_type === "MEAL" &&
        new Date(s.startTime).getHours() < 16,
    );
    if (!hasLunch) return "PROMPT_LUNCH";
  }

  return null;
};
