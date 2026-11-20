// utils/timeline.ts
// The plan's timeline math, with no database or store access (pure, so the
// plan evaluator and future tests can use it directly).
//
//   deriveSequentialTimeline: an order of stops -> stops, travel legs and gaps
//   evaluateContextAt: how full and how tired you are at a given moment
//
// Where a stop happens (stopLocation): its venue, except stay-in ideas,
// which happen at home. A go-out plan can include them ("go out" means
// willing to travel), with a leg home before and back out after.

import type {ScoredActivity, TimeSlot, TravelLeg} from "@/types/itinerary";
import type {UserPrefs} from "@/src/store/usePrefsStore";
import {getDistance} from "./geo";
import type {WeatherLookup} from "@/src/lib/weatherRules";

export type PlacedActivity = {
  // The order of the array dictates the time.
  activity: ScoredActivity;
  /** How long you plan to spend, if you changed it (else the idea's estimate) */
  durationMinutes?: number;
  /** Minutes added past the suggestion to fit the plan better (utils/stretch.ts), until you change it */
  stretchedBy?: number;
};

/** The idea's suggested length, on the 15-minute grid. */
export const suggestedMinutes = (activity: any): number =>
  snapTo15(Number(activity?.est_duration_minutes) || 60);

/** How long a placed stop lasts: your length if you set one, else the suggestion. */
export const stopMinutes = (p: PlacedActivity): number =>
  p.durationMinutes != null ? p.durationMinutes : suggestedMinutes(p.activity);

export type LatLng = {latitude: number; longitude: number};

// PostGIS Hex Decoder
export const parseCoordinates = (hex: string | null | undefined) => {
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

const asLatLng = (value: any): LatLng | null => {
  const coords = value?.currentLocation ? value.currentLocation : value;
  return coords?.latitude && coords?.longitude
    ? {latitude: coords.latitude, longitude: coords.longitude}
    : null;
};

/** Miles between two places; 0 when either is missing coordinates. */
export const safeGetDistance = (a: any, b: any): number => {
  const from = asLatLng(a);
  const to = asLatLng(b);
  return from && to ? getDistance(from, to) : 0;
};

/** Miles to drive between two places: 0 when they're next door (SAME_PLACE_MILES). */
const legMiles = (a: any, b: any): number => {
  const miles = safeGetDistance(a, b);
  return miles < SAME_PLACE_MILES ? 0 : miles;
};

/** Starting this close to the saved home area means you're starting from home. */
export const HOME_RADIUS_MILES = 2;
/** Legs shorter than this aren't travel: the same block or plaza (~500 ft), or already there. Short hops beyond it get real walking times with #50. */
export const SAME_PLACE_MILES = 0.1;

/**
 * Home, for stay-in stops and the trip back. The saved home is only an area
 * (rounded to ~½ mile for privacy), so if the plan starts within
 * HOME_RADIUS_MILES of it, you're starting from home: use that exact spot.
 * Starting farther away (work, say) uses the saved area; no saved home uses
 * where the plan starts.
 */
export const homeOf = (prefs: UserPrefs): LatLng | null => {
  // A re-planned stretch (#63) keeps the date's home (it starts elsewhere)
  if (prefs.fixedHome) return prefs.fixedHome;
  const start = asLatLng(prefs.currentLocation);
  const saved = asLatLng(prefs.homeLocation);
  if (start && saved && getDistance(start, saved) <= HOME_RADIUS_MILES) return start;
  return saved ?? start;
};

/** Where a stop happens: its venue, or home for stay-in ideas. */
export const stopLocation = (activity: any, prefs: UserPrefs): LatLng | null =>
  activity?.modality === "STAY_IN" ? homeOf(prefs) : asLatLng(activity);

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

// ─── Travel estimates (#48, no outside service) ────────────────────────────
//
// The schedule stays on 15-minute steps: each travel block is a whole
// number of them, with the real trip inside and the slack around it (#47):
//
//   [ linger ][ drive ][ park & walk in ][ arrive buffer ]
//
//   - road miles: straight-line × ROAD_FACTOR (roads aren't straight)
//   - drive time by distance: the first miles are city streets (lights,
//     turns), longer trips reach faster roads (SPEED_BANDS)
//   - parking + walking in: always when driving to a place; none pulling
//     into your own driveway
//   - block: drive + parking + ARRIVE_MIN, rounded up to 15 minutes; what's
//     left is split between lingering at the last stop and arriving early

/** Roads wind: a typical road trip is ~30% longer than the straight line */
export const ROAD_FACTOR = 1.3;
/** Minutes per road mile, by stretch of the trip (average speeds, stops included) */
const SPEED_BANDS: {upTo: number; minPerMile: number}[] = [
  {upTo: 2, minPerMile: 60 / 20}, // city streets
  {upTo: 10, minPerMile: 60 / 32}, // main roads
  {upTo: Infinity, minPerMile: 60 / 55}, // highway
];
/** Parking and walking in */
export const PARKING_MINUTES = 5;
/** Always at least this much spare on arrival */
const ARRIVE_MIN = 3;

/** Minutes to drive this many road miles. */
export const driveMinutes = (roadMiles: number): number => {
  let minutes = 0;
  let from = 0;
  for (const band of SPEED_BANDS) {
    if (roadMiles <= from) break;
    minutes += (Math.min(roadMiles, band.upTo) - from) * band.minPerMile;
    from = band.upTo;
  }
  return Math.max(1, Math.round(minutes));
};

/**
 * The trip for `miles` (straight-line); null for none (0, or next door).
 * `parking: false` when arriving home.
 */
export const travelLeg = (miles: number, {parking = true}: {parking?: boolean} = {}): TravelLeg | null => {
  if (!(miles > 0)) return null;
  const roadMiles = miles * ROAD_FACTOR;
  const drive = driveMinutes(roadMiles);
  const park = parking ? PARKING_MINUTES : 0;
  const blockMinutes = Math.max(15, Math.ceil((drive + park + ARRIVE_MIN) / 15) * 15);
  const spare = blockMinutes - drive - park;
  // Arrive with ARRIVE_MIN, and split the rest (an odd minute goes to arriving)
  const lingerMinutes = Math.floor((spare - ARRIVE_MIN) / 2);
  return {
    miles,
    roadMiles,
    driveMinutes: drive,
    parkingMinutes: park,
    blockMinutes,
    lingerMinutes,
    bufferMinutes: spare - lingerMinutes,
  };
};

/** The schedule block for a trip, in minutes (0 for none). */
export const travelMinutes = (miles: number, options?: {parking?: boolean}): number =>
  travelLeg(miles, options)?.blockMinutes ?? 0;

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
  d.setSeconds(0, 0);
  return d;
};

/** 12+ hours counts as open-ended ("no end time"). */
export const isOpenEnded = (prefs: UserPrefs): boolean =>
  (new Date(prefs.endDate).getTime() - new Date(prefs.startDate).getTime()) /
    3_600_000 >=
  12;

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

  const goingOut = prefs.modality === "GO_OUT";
  const home = homeOf(prefs);
  let cursor = dayStart;
  let here: LatLng | null = asLatLng(prefs.currentLocation);

  // 1. Pack everything left-to-right dynamically
  placed.forEach((p, index) => {
    const activity = p.activity;
    const there = stopLocation(activity, prefs);

    // Travel from the previous place (stay-in stops are at home)
    if (goingOut) {
      const toHome = activity.modality === "STAY_IN";
      // (no parking pulling into your own driveway)
      const leg = travelLeg(legMiles(here, there), {parking: !toHome});
      if (leg) {
        const travelMs = leg.blockMinutes * 60_000;
        slots.push({
          id: `${toHome ? "home" : "travel"}-${activity.idea_id}-${index}`,
          title: `${toHome ? "Head home" : "Travel & Parking"} (${leg.roadMiles.toFixed(1)} mi)`,
          startTime: cursor,
          endTime: cursor + travelMs,
          type: "OCCUPIED",
          activity: null,
          travel: leg,
        });
        cursor += travelMs;
      }
    }

    const durationMs = stopMinutes(p) * 60_000;

    slots.push({
      id: `act-${activity.idea_id}-${index}`,
      title: activity.title,
      startTime: cursor,
      endTime: cursor + durationMs,
      type: "OCCUPIED",
      activity: activity,
    });

    cursor += durationMs;
    if (there) here = there;
  });

  // 2. Return Journey (none if the last stop was already at home)
  if (goingOut) {
    const leg = travelLeg(legMiles(here, home), {parking: false});
    if (leg) {
      const travelMs = leg.blockMinutes * 60_000;
      slots.push({
        id: "return-journey",
        title: `Head Home (${leg.roadMiles.toFixed(1)} mi)`,
        startTime: cursor,
        endTime: cursor + travelMs,
        type: "OCCUPIED",
        activity: null,
        travel: leg,
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

/**
 * A live date re-planned from a point (reordering the rest of it, #63): the
 * first `kept` stops stay as they were; the rest start at `startDate` from
 * `location` (where you were; null = the last kept stop's place).
 */
export type Replan = {kept: number; startDate: string; location: LatLng | null};

/**
 * The timeline of a date that's been re-planned: each stretch of stops is
 * laid out from its own start (the plan's, then each re-plan's), and only
 * the last stretch heads home. With no re-plans, the same as
 * deriveSequentialTimeline.
 */
export const deriveReplannedTimeline = (
  placed: PlacedActivity[],
  prefs: UserPrefs,
  replans: Replan[] | null | undefined,
): TimeSlot[] => {
  const points = (replans ?? [])
    .filter((r) => r.kept > 0 && r.kept < placed.length)
    .sort((a, b) => a.kept - b.kept);
  if (points.length === 0) {
    // A re-plan before the first stop just moves the start
    const fromStart = (replans ?? []).find((r) => r.kept === 0);
    return deriveSequentialTimeline(
      placed,
      fromStart
        ? {
            ...prefs,
            startDate: fromStart.startDate,
            currentLocation: fromStart.location ?? prefs.currentLocation,
            fixedHome: homeOf(prefs),
          }
        : prefs,
    );
  }

  const slots: TimeSlot[] = [];
  const bounds = [0, ...points.map((r) => r.kept), placed.length];
  for (let i = 0; i < bounds.length - 1; i++) {
    const part = placed.slice(bounds[i], bounds[i + 1]);
    const replan = i === 0 ? null : points[i - 1];
    const lastBefore = placed[bounds[i] - 1];
    const partPrefs: UserPrefs = replan
      ? {
          ...prefs,
          startDate: replan.startDate,
          currentLocation:
            replan.location ??
            (lastBefore ? stopLocation(lastBefore.activity, prefs) : null) ??
            prefs.currentLocation,
          fixedHome: homeOf(prefs),
        }
      : prefs;
    const partSlots = deriveSequentialTimeline(part, partPrefs);
    if (i < bounds.length - 2) {
      // Not the last stretch: up to its last stop (no trip home, no free time)
      const lastStop = partSlots.map((slot) => !!slot.activity).lastIndexOf(true);
      slots.push(...partSlots.slice(0, lastStop + 1));
    } else {
      slots.push(...partSlots);
    }
  }
  return slots;
};

/**
 * Miles of driving in a plan (go-out plans; 0 when staying in): from the
 * start, stop to stop, and home. The same legs deriveSequentialTimeline
 * draws, so "how much driving does this add" matches the timeline.
 */
export const drivingMiles = (placed: PlacedActivity[], prefs: UserPrefs): number => {
  if (prefs.modality !== "GO_OUT" || placed.length === 0) return 0;
  let here: LatLng | null = asLatLng(prefs.currentLocation);
  let miles = 0;
  for (const p of placed) {
    const there = stopLocation(p.activity, prefs);
    miles += legMiles(here, there);
    if (there) here = there;
  }
  return miles + legMiles(here, homeOf(prefs));
};

// ─── Context Engine (The "Meters") ─────────────────────────────────────────────

export type DayContext = {
  exhaustion: number; // 0 (Fresh) to 100 (Dead)
  satiation: number; // 0 (Starving) to 100 (Stuffed)
  /** When the next stop would start (ms), for time-of-day fit */
  atMs?: number;
  /** The date's weather, for weather fit (src/lib/weather.ts) */
  weatherAt?: WeatherLookup;
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
      // Travel, flex time or a gap (resting & digesting). Driving isn't
      // much of a rest, so it recovers energy half as fast as sitting down.
      const driving = slot.type === "OCCUPIED";
      exhaustion -= durationMins * (driving ? 0.25 : 0.5);
      satiation -= durationMins * 0.3;
    }

    // Clamp values between 0 and 100
    exhaustion = Math.max(0, Math.min(100, exhaustion));
    satiation = Math.max(0, Math.min(100, satiation));
  });

  return {exhaustion, satiation};
};
