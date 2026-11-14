// src/utils/itineraryEngine.ts
import {ScoredActivity, TimeSlot} from "@/types/itinerary";
import {BaseActivity} from "@/types/activities";
import {getDistance} from "./geo";
import {UserPrefs} from "@/src/store/usePrefsStore";
import {supabase} from "@/src/supabase";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PlacedActivity = {
  // THE FIX: No more anchoredAt! The order of the array dictates the time.
  activity: ScoredActivity;
};

export type UI_Trigger = "PROMPT_DINNER" | "PROMPT_LUNCH" | null;

// ─── Pure Helpers ──────────────────────────────────────────────────────────────

// PostGIS Hex Decoder
const parseCoordinates = (hex: string | null | undefined) => {
  if (!hex || typeof hex !== "string" || hex.length < 25) return null;
  try {
    const buffer = new Uint8Array(
      hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    const view = new DataView(buffer.buffer);
    const littleEndian = buffer[0] === 1;
    return {
      longitude: view.getFloat64(9, littleEndian),
      latitude: view.getFloat64(17, littleEndian),
    };
  } catch {
    return null;
  }
};

// TS Helper to safely extract coordinates and satisfy the Locatable strictness
const safeGetDistance = (a: any, b: any): number => {
  const coordsA = a?.currentLocation ? a.currentLocation : a;
  const coordsB = b?.currentLocation ? b.currentLocation : b;

  // If either location is missing valid coordinates, return 0 distance
  if (
    !coordsA?.latitude ||
    !coordsA?.longitude ||
    !coordsB?.latitude ||
    !coordsB?.longitude
  ) {
    return 0;
  }

  // Pass strictly typed objects to the actual getDistance function
  return getDistance(
    {latitude: coordsA.latitude, longitude: coordsA.longitude},
    {latitude: coordsB.latitude, longitude: coordsB.longitude},
  );
};

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
      const dist = safeGetDistance(prevLocation, activity);
      travelMs = snapTo15(dist > 0 ? dist * 3 + 5 : 0) * 60_000;
    }

    const durationMs =
      snapTo15(Number(activity.est_duration_minutes) || 60) * 60_000;

    // Add Travel Slot (if applicable)
    if (travelMs > 0) {
      slots.push({
        id: `travel-${activity.idea_id}-${index}`,
        title: `Travel & Parking (${safeGetDistance(prevLocation, activity).toFixed(1)} mi)`,
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
    const dist = safeGetDistance(prevLocation, prefs);

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

// ─── Context Engine (The "Meters") ─────────────────────────────────────────────

export type DayContext = {
  exhaustion: number; // 0 (Fresh) to 100 (Dead)
  satiation: number; // 0 (Starving) to 100 (Stuffed)
};

// Calculates the physical state of the user at a specific timestamp
export const evaluateContextAt = (
  timeline: TimeSlot[],
  targetTimeMs: number,
): DayContext => {
  let exhaustion = 0;
  let satiation = 0;

  // Chronologically walk through everything that happened BEFORE the target gap
  const pastSlots = timeline.filter((s) => s.endTime <= targetTimeMs);

  pastSlots.forEach((slot) => {
    const durationMins = Math.round((slot.endTime - slot.startTime) / 60_000);

    if (slot.type === "OCCUPIED" && slot.activity) {
      const type = slot.activity.activity_type;

      // 1. Process Satiation
      if (type === "MEAL") satiation = 100;
      else if (type === "TREAT") satiation = Math.min(100, satiation + 40);
      else satiation -= durationMins * 0.3; // Burn calories while doing things

      // 2. Process Exhaustion
      if (type === "ACTIVE") {
        exhaustion += durationMins * 0.8; // +48 points for a 60min hike
      } else {
        exhaustion -= durationMins * 0.5; // Resting during movies/meals
      }
    } else {
      // It's a travel gap or buffer (Resting & digesting)
      exhaustion -= durationMins * 0.5;
      satiation -= durationMins * 0.3;
    }

    // Clamp values between 0 and 100
    exhaustion = Math.max(0, Math.min(100, exhaustion));
    satiation = Math.max(0, Math.min(100, satiation));
  });

  return {exhaustion, satiation};
};

// ─── Unified Scoring ───────────────────────────────────────────────────────────

export const deriveInitialContext = (prefs: UserPrefs): DayContext => {
  let satiation = 50;
  let exhaustion = 0;

  // Get the start hour once at the top
  const startHour = new Date(prefs.startDate || Date.now()).getHours();

  // 1. Tag Inference
  const wantsFood = prefs.vibes?.some((v) =>
    ["casual", "fancy", "sweets", "soda", "cafes"].includes(v),
  );

  if (wantsFood) {
    satiation = 0;
  } else {
    // 2. Time Inference
    if (startHour >= 20) {
      satiation = 90;
    } else if (startHour >= 17 && startHour <= 19) {
      satiation = 20;
    }
  }

  // 3. Late Night Exhaustion
  if (startHour >= 22) exhaustion = 30;

  return {exhaustion, satiation};
};

export const scoreActivities = ({
  activities,
  prefs,
  origin,
  context,
}: {
  activities: BaseActivity[];
  prefs: UserPrefs;
  origin: ScoredActivity | UserPrefs | null;
  context: DayContext;
}): ScoredActivity[] => {
  if (!activities?.length) return [];

  return activities
    .map((item) => {
      const distance = safeGetDistance(origin, item);
      let score = 50; // Base score

      // --- 1. BIOLOGICAL CONTEXT SCORING ---
      const type = item.activity_type;

      if (type === "ACTIVE") {
        // High exhaustion heavily penalizes active ideas
        score -= context.exhaustion * 0.8;
      }

      if (type === "MEAL") {
        // If stuffed (100), massive penalty (-80). If starving (0), massive bonus (+40).
        if (context.satiation > 70) score -= 80;
        else score += (100 - context.satiation) * 0.4;
      }

      if (type === "TREAT") {
        // Treats are appealing unless completely stuffed
        if (context.satiation > 85) score -= 40;
        else score += 15;
      }

      if (type === "OTHER") {
        // If exhausted, chill activities get a nice boost
        if (context.exhaustion > 60) score += 25;
      }

      // --- 2. VIBES/TAGS MATCHING ---
      if (prefs.vibes && prefs.vibes.length > 0) {
        const matchCount = prefs.vibes.filter((v) =>
          item.tags?.includes(v),
        ).length;
        score += matchCount * 15;
      }

      // --- 3. LOGISTICAL PENALTIES ---
      const budgetPerPerson =
        (Number(prefs.budget) || 0) / (Number(prefs.headCount) || 1);
      score -=
        Math.abs((Number(item.est_price_per_person) || 0) - budgetPerPerson) *
        1.5;

      if (item.modality !== "STAY_IN" && prefs.modality !== "STAY_IN") {
        score -= distance * 1.2; // Penalize long drives
      }

      return {
        ...item,
        est_price_per_person: Number(item.est_price_per_person) || 0,
        score: Math.round(score), // Clean integer
        distance: parseFloat((distance || 0).toFixed(2)),
      } as ScoredActivity;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
};

// ─── Unified Database Query ────────────────────────────────────────────────────

export const queryCandidates = async (
  prefs: UserPrefs,
  maxDuration: number,
  maxBudget: number,
  origin: ScoredActivity | UserPrefs,
  context: DayContext,
) => {
  const targetBudgetPerPerson = maxBudget / (Number(prefs.headCount) || 1);

  try {
    const {data, error} = await supabase
      .from("activities")
      .select(
        `
        *, 
        venues ( name, address, coordinates ),
        activity_tags ( tags ( name ) )
      `,
      )
      .eq("modality", prefs.modality)
      .lte("est_price_per_person", targetBudgetPerPerson)
      .lte("est_duration_minutes", maxDuration);

    if (error) throw error;

    const formatted = (data || []).map((row: any) => {
      const parsed = parseCoordinates(row.venues?.coordinates);
      const flatTags = row.activity_tags
        ? row.activity_tags.map((at: any) => at.tags?.name).filter(Boolean)
        : [];

      return {
        ...row,
        tags: flatTags,
        latitude: parsed?.latitude ?? null,
        longitude: parsed?.longitude ?? null,
      };
    });

    return {
      success: true,
      data: scoreActivities({
        activities: formatted as BaseActivity[],
        prefs,
        origin,
        context,
      }),
    };
  } catch (error) {
    console.error("queryCandidates error:", error);
    return {success: false, error, data: []};
  }
};
