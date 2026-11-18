// src/utils/itineraryEngine.ts
import {ScoredActivity, TimeSlot} from "@/types/itinerary";
import {BaseActivity} from "@/types/activities";
import {UserPrefs} from "@/src/store/usePrefsStore";
import {supabase} from "@/src/supabase";
import {useProfileStore} from "@/src/store/useProfileStore";
import {useHiddenStore} from "@/src/store/useHiddenStore";
import {bestTimeLabel, isGoodTime} from "@/src/lib/timeOfDay";
import {weatherProblems} from "@/src/lib/weatherRules";
import {type DayContext, parseCoordinates, safeGetDistance, stopLocation} from "./timeline";

/** Stay-in ideas in a go-out plan rank a little lower ("go out" = willing to travel) */
const STAY_IN_ON_GO_OUT_PENALTY = 10;

// The timeline and hunger/energy math moved to ./timeline (pure, no
// database); re-exported here so existing imports keep working.
export {
  type DayContext,
  type PlacedActivity,
  deriveSequentialTimeline,
  evaluateContextAt,
  formatTime,
  makeGap,
  parseCoordinates,
  snapTo15,
} from "./timeline";

export type UI_Trigger = "PROMPT_DINNER" | "PROMPT_LUNCH" | null;

// ─── Unified Scoring ───────────────────────────────────────────────────────────

/**
 * How well an idea matches what you asked for, apart from how it fits the
 * plan (the plan evaluator judges that): vibes, budget and distance. The
 * builder ranks suggestions by this plus the evaluator's verdict.
 */
export const preferenceScore = (item: any, prefs: UserPrefs, miles: number): number => {
  let score = 0;
  if (prefs.vibes && prefs.vibes.length > 0) {
    score += prefs.vibes.filter((v) => item.tags?.includes(v)).length * 15;
  }
  const budgetPerPerson = (Number(prefs.budget) || 0) / (Number(prefs.headCount) || 1);
  score -= Math.abs((Number(item.est_price_per_person) || 0) - budgetPerPerson) * 1.5;
  if (prefs.modality === "GO_OUT") {
    score -= miles * 1.2; // long drives (home counts too)
    if (item.modality === "STAY_IN") score -= STAY_IN_ON_GO_OUT_PENALTY;
  }
  return score;
};

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

  // Where you're coming from: the plan's start, or the last stop's place
  const from =
    origin && "idea_id" in origin ? stopLocation(origin, prefs) : origin;

  return activities
    .map((item) => {
      // Both ends where they really happen: stay-in ideas (including a
      // stay-in last stop as the origin) are at home, not "nowhere"
      const distance = safeGetDistance(from, stopLocation(item, prefs));
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

      // --- 2. WHAT YOU PREFER: vibes, budget, distance (shared with the builder) ---
      score += preferenceScore(item, prefs, distance);

      // --- 3. TIME OF DAY ---
      // Outside its best time (stargazing at noon) it sinks, but stays pickable
      const offHours =
        context.atMs != null && !isGoodTime(item.time_of_day, new Date(context.atMs));
      if (offHours) score -= 40;

      // --- 3b. WEATHER (when the builder has it) ---
      const weather =
        context.atMs != null
          ? weatherProblems(
              item,
              context.atMs,
              context.atMs + (Number(item.est_duration_minutes) || 60) * 60_000,
              context.weatherAt,
            )
          : [];
      score -= weather.reduce((sum, problem) => sum + problem.penalty, 0);


      return {
        ...item,
        est_price_per_person: Number(item.est_price_per_person) || 0,
        score: Math.round(score), // Clean integer
        distance: parseFloat((distance || 0).toFixed(2)),
        // Shown on the picker card when it's not a great time for it
        offHoursLabel: offHours ? bestTimeLabel(item.time_of_day) : null,
        // ...and when the weather's against it
        weatherProblem: weather[0] ?? null,
      } as ScoredActivity;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
};

// ─── One idea, ready to place ──────────────────────────────────────────────────

/** Loads one idea and scores it like a candidate ("Plan a date with this"). */
export const fetchActivityForPlan = async (
  ideaId: number,
  prefs: UserPrefs,
): Promise<ScoredActivity | null> => {
  const {data, error} = await supabase
    .from("activities")
    .select(
      `
      *,
      venues ( name, address, coordinates, opening_hours ),
      activity_tags ( tags ( name ) )
    `,
    )
    .eq("idea_id", ideaId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("fetchActivityForPlan error:", error);
    return null;
  }

  const parsed = parseCoordinates(data.venues?.coordinates);
  const formatted = {
    ...data,
    tags: (data.activity_tags ?? [])
      .map((at: any) => at.tags?.name)
      .filter(Boolean),
    latitude: parsed?.latitude ?? null,
    longitude: parsed?.longitude ?? null,
  };
  const [scored] = scoreActivities({
    activities: [formatted as BaseActivity],
    prefs,
    origin: prefs,
    context: {exhaustion: 0, satiation: 0},
  });
  return scored ?? null;
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
  const userId = useProfileStore.getState().userId;

  try {
    const {data, error} = await supabase
      .from("activities")
      .select(
        `
        *, 
        venues ( name, address, coordinates, opening_hours ),
        activity_tags ( tags ( name ) )
      `,
      )
      // Published ideas, plus ALL of your own: until one is approved it acts
      // like a private idea (yours to plan with, hidden from everyone else;
      // RLS enforces the "hidden" part, this just says it out loud). Not
      // held ones (reported, waiting for a moderator, #76)
      .or(
        userId
          ? `and(visibility.eq.PUBLISHED,held_at.is.null),user_id.eq.${userId}`
          : "and(visibility.eq.PUBLISHED,held_at.is.null)",
      )
      // Going out means willing to travel, so stay-in ideas (at home) count
      // too; staying in means staying in
      .in("modality", prefs.modality === "GO_OUT" ? ["GO_OUT", "STAY_IN"] : ["STAY_IN"])
      // Loose caps only: an idea that's a bit too long or over budget still
      // comes back, so the builder can show it greyed with its reason ("Too
      // long for the time left", "Over your remaining budget") instead of it
      // silently missing. Far-off ones stay out so the list doesn't balloon
      .lte("est_price_per_person", Math.max(targetBudgetPerPerson * 2, targetBudgetPerPerson + 25))
      .lte("est_duration_minutes", Math.max(maxDuration * 2, maxDuration + 120));

    if (error) throw error;

    // Skip ideas you marked "Not interested"
    const hidden = useHiddenStore.getState().ids;
    const formatted = (data || [])
      .filter((row: any) => !hidden.has(row.idea_id))
      .map((row: any) => {
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
