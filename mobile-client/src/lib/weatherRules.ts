// src/lib/weatherRules.ts
// Does the weather suit an idea? Pure (no network): the caller supplies a
// `weatherAt(ms)` lookup (see src/lib/weather.ts), and an unknown lookup
// means no penalty. Used by the plan evaluator (stop warnings) and by the
// builder's suggestions (ranking + a chip saying why).
//
// What an idea needs (activities.weather_needs; null = default by environment):
//   ANY   indoor default, never penalized
//   NICE  outdoor default: about 50-90 F, no rain, not very windy
//   WARM  70 F or warmer (swimming, beach)
//   COLD  freezing or snow (sledding, outdoor skating)
//   mixed indoor/outdoor ideas get a lighter NICE

export type WeatherNeeds = "ANY" | "NICE" | "WARM" | "COLD";

export const WEATHER_NEEDS_OPTIONS: {value: WeatherNeeds; label: string; hint: string}[] = [
  {value: "ANY", label: "Any weather", hint: "Weather doesn't matter"},
  {value: "NICE", label: "Nice weather", hint: "Mild, dry, not too windy"},
  {value: "WARM", label: "Warm weather", hint: "70°F or warmer"},
  {value: "COLD", label: "Cold or snow", hint: "Freezing or snowy"},
];

/** What the weather is (or usually is) at a moment. */
export type Conditions = {
  source: "forecast" | "typical";
  tempF: number;
  /** 0-100 */
  rainChance: number;
  gustMph: number;
  /** null when unknown */
  snowOnGround: boolean | null;
  code: number | null;
};

export type WeatherLookup = (ms: number) => Conditions | null;

export type WeatherProblemKind = "TOO_COLD" | "TOO_HOT" | "RAIN" | "WIND" | "NO_SNOW";

export type WeatherProblem = {
  kind: WeatherProblemKind;
  severity: "hard" | "soft";
  message: string;
  penalty: number;
};

// ─── Tuning ────────────────────────────────────────────────────────────────────

type Profile = {
  minF: number;
  maxF: number;
  rainSoft: number; // rain chance (%) for a soft problem
  rainHard: number; // ...and a hard one
  gustMph: number;
  needsSnowOrIce: boolean;
  factor: number; // scales every penalty
};

const PROFILES: Record<WeatherNeeds | "MIXED", Profile | null> = {
  ANY: null,
  NICE: {minF: 50, maxF: 90, rainSoft: 50, rainHard: 80, gustMph: 30, needsSnowOrIce: false, factor: 1},
  WARM: {minF: 70, maxF: 100, rainSoft: 50, rainHard: 80, gustMph: 30, needsSnowOrIce: false, factor: 1},
  COLD: {minF: -30, maxF: 40, rainSoft: 101, rainHard: 101, gustMph: 40, needsSnowOrIce: true, factor: 1},
  // Part indoors: weather matters less
  MIXED: {minF: 40, maxF: 95, rainSoft: 70, rainHard: 101, gustMph: 40, needsSnowOrIce: false, factor: 0.5},
};

export const WEATHER_PENALTY = {
  perDegree: 2,
  temperatureMax: 35,
  hardDegrees: 20, // this far outside the range (forecast) is hard
  rainSoft: 30,
  rainHard: 45,
  wind: 20,
  noSnow: 30,
  typicalFactor: 0.6, // typical weather is less certain: lighter, never hard
};

// ─── Rules ─────────────────────────────────────────────────────────────────────

/** An idea's needs, filling in the default for its environment. */
export function weatherNeedsOf(activity: any): WeatherNeeds | "MIXED" {
  const explicit = activity?.weather_needs as WeatherNeeds | null | undefined;
  if (explicit) return explicit;
  if (activity?.environment === "OUTDOOR") return "NICE";
  if (activity?.environment === "MIXED") return "MIXED";
  return "ANY";
}

/**
 * What's wrong with the weather for `activity` between `startMs` and `endMs`
 * (checked at the start, middle and end). Empty if fine or unknown.
 */
export function weatherProblems(
  activity: any,
  startMs: number,
  endMs: number,
  weatherAt: WeatherLookup | null | undefined,
): WeatherProblem[] {
  const profile = PROFILES[weatherNeedsOf(activity)];
  if (!profile || !weatherAt) return [];

  const samples = [startMs, (startMs + endMs) / 2, endMs]
    .map((ms) => weatherAt(ms))
    .filter((c): c is Conditions => !!c);
  if (samples.length === 0) return [];

  const typical = samples[0].source === "typical";
  const scale = profile.factor * (typical ? WEATHER_PENALTY.typicalFactor : 1);
  const problems: WeatherProblem[] = [];
  const push = (kind: WeatherProblemKind, hard: boolean, message: string, penalty: number) =>
    problems.push({
      kind,
      severity: hard && !typical && profile.factor === 1 ? "hard" : "soft",
      message,
      penalty: Math.round(penalty * scale),
    });

  // Temperature: the sample furthest outside the range
  const coldest = Math.min(...samples.map((c) => c.tempF));
  const warmest = Math.max(...samples.map((c) => c.tempF));
  const tooCold = profile.minF - coldest;
  const tooHot = warmest - profile.maxF;
  const temp = (f: number) => `${Math.round(f)}°F`;
  // Snow / ice ideas: "no snow" says it better than "too warm"
  const noSnow =
    profile.needsSnowOrIce && samples.every((c) => c.snowOnGround === false) && coldest > 32;
  if (tooCold > 0 && tooCold >= tooHot) {
    push(
      "TOO_COLD",
      tooCold > WEATHER_PENALTY.hardDegrees,
      typical ? `Usually cold then (~${temp(coldest)})` : `Cold: ${temp(coldest)} forecast`,
      Math.min(WEATHER_PENALTY.temperatureMax, tooCold * WEATHER_PENALTY.perDegree),
    );
  } else if (tooHot > 0 && !noSnow) {
    const word = profile.needsSnowOrIce ? "Too warm" : "Hot";
    push(
      "TOO_HOT",
      tooHot > WEATHER_PENALTY.hardDegrees,
      typical
        ? `Usually ${word.toLowerCase()} then (~${temp(warmest)})`
        : `${word}: ${temp(warmest)} forecast`,
      Math.min(WEATHER_PENALTY.temperatureMax, tooHot * WEATHER_PENALTY.perDegree),
    );
  }

  // Rain
  const rain = Math.max(...samples.map((c) => c.rainChance));
  if (rain >= profile.rainSoft) {
    const hard = rain >= profile.rainHard;
    push(
      "RAIN",
      hard,
      typical ? `Often rainy this time of year (${Math.round(rain)}%)` : `${Math.round(rain)}% chance of rain`,
      hard ? WEATHER_PENALTY.rainHard : WEATHER_PENALTY.rainSoft,
    );
  }

  // Wind
  const gust = Math.max(...samples.map((c) => c.gustMph));
  if (gust >= profile.gustMph) {
    push(
      "WIND",
      false,
      typical ? "Often windy this time of year" : `Gusts to ${Math.round(gust)} mph`,
      WEATHER_PENALTY.wind,
    );
  }

  // Snow / ice ideas need snow on the ground or a freeze
  if (noSnow) {
    push(
      "NO_SNOW",
      false,
      typical ? "Usually no snow then" : "No snow or ice expected",
      WEATHER_PENALTY.noSnow,
    );
  }

  return problems.sort((a, b) => b.penalty - a.penalty);
}
