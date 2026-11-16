// src/lib/weather.ts
// Weather for a planned date, from Open-Meteo (free, no key).
//
//   Up to ~15 days out: the hourly forecast.
//   Further out: typical weather, averaged from the same week over the past
//   5 years. This is what makes "a November hike in Utah is cold" work
//   for dates planned far ahead, and it's location-aware.
//
// Privacy: coordinates are rounded to 0.1° (~7 mi) before they leave the
// app, so an exact home location is never sent. Weather doesn't change at
// that scale. Results are cached for an hour.
//
// Note: Open-Meteo's free tier is for non-commercial use. Before a public
// launch, get a plan or switch providers (see #66).

import type {Conditions, WeatherLookup} from "./weatherRules";

export type HourWeather = {
  ms: number;
  tempF: number;
  rainChance: number;
  gustMph: number;
  snowDepthIn: number;
  code: number;
};

export type TypicalWeather = {
  highF: number;
  lowF: number;
  /** Share of days with real rain (%) */
  rainChance: number;
  gustMph: number;
  snowy: boolean;
  years: number;
};

export type DateWeather =
  | {source: "forecast"; hours: HourWeather[]}
  | {source: "typical"; typical: TypicalWeather};

type Place = {latitude: number; longitude: number};

const FORECAST_HORIZON_DAYS = 15;
const TYPICAL_YEARS = 5;
const CACHE_MS = 60 * 60 * 1000;
const DAY_MS = 86_400_000;

const round1 = (v: number) => Math.round(v * 10) / 10;
const dateKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const cache = new Map<string, {at: number; value: Promise<DateWeather | null>}>();

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  return res.json();
}

async function fetchForecast(place: Place, startMs: number, endMs: number): Promise<DateWeather> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&hourly=temperature_2m,precipitation_probability,wind_gusts_10m,snow_depth,weather_code" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&timeformat=unixtime&timezone=auto" +
    `&start_date=${dateKey(startMs)}&end_date=${dateKey(endMs)}`;
  const data = await getJson(url);
  const h = data.hourly ?? {};
  const hours: HourWeather[] = (h.time ?? []).map((t: number, i: number) => ({
    ms: t * 1000,
    tempF: h.temperature_2m?.[i] ?? 0,
    rainChance: h.precipitation_probability?.[i] ?? 0,
    gustMph: h.wind_gusts_10m?.[i] ?? 0,
    snowDepthIn: (h.snow_depth?.[i] ?? 0) * 39.37,
    code: h.weather_code?.[i] ?? 0,
  }));
  return {source: "forecast", hours};
}

async function fetchTypical(place: Place, startMs: number): Promise<DateWeather> {
  const years = Array.from({length: TYPICAL_YEARS}, (_, i) => i + 1);
  const results = await Promise.allSettled(
    years.map((back) => {
      const center = new Date(startMs);
      center.setFullYear(center.getFullYear() - back);
      const url =
        "https://archive-api.open-meteo.com/v1/archive" +
        `?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&start_date=${dateKey(center.getTime() - 3 * DAY_MS)}&end_date=${dateKey(center.getTime() + 3 * DAY_MS)}` +
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,snowfall_sum" +
        "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto";
      return getJson(url);
    }),
  );

  const days: {hi: number; lo: number; rain: number; gust: number; snow: number}[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const d = r.value.daily ?? {};
    (d.time ?? []).forEach((_: string, i: number) => {
      if (d.temperature_2m_max?.[i] == null) return;
      days.push({
        hi: d.temperature_2m_max[i],
        lo: d.temperature_2m_min?.[i] ?? d.temperature_2m_max[i],
        rain: d.precipitation_sum?.[i] ?? 0, // mm
        gust: d.wind_gusts_10m_max?.[i] ?? 0,
        snow: d.snowfall_sum?.[i] ?? 0, // cm
      });
    });
  }
  if (days.length === 0) throw new Error("No typical weather");

  const avg = (f: (d: (typeof days)[number]) => number) =>
    days.reduce((s, d) => s + f(d), 0) / days.length;
  const share = (f: (d: (typeof days)[number]) => boolean) =>
    (days.filter(f).length / days.length) * 100;
  const highF = avg((d) => d.hi);
  return {
    source: "typical",
    typical: {
      highF,
      lowF: avg((d) => d.lo),
      rainChance: share((d) => d.rain >= 1),
      gustMph: avg((d) => d.gust),
      snowy: share((d) => d.snow >= 0.5) >= 30 || highF <= 34,
      years: results.filter((r) => r.status === "fulfilled").length,
    },
  };
}

/**
 * The weather for a date (cached). Resolves null when it can't be had
 * (offline, no location); callers treat that as "unknown, no penalty".
 */
export function getDateWeather(
  place: Place | null | undefined,
  startMs: number,
  endMs: number,
): Promise<DateWeather | null> {
  if (!place) return Promise.resolve(null);
  const rounded = {latitude: round1(place.latitude), longitude: round1(place.longitude)};
  const forecast = startMs - Date.now() <= FORECAST_HORIZON_DAYS * DAY_MS;
  // Long dates get the forecast up to the horizon
  const end = Math.min(endMs, Date.now() + FORECAST_HORIZON_DAYS * DAY_MS);
  const key = `${rounded.latitude},${rounded.longitude},${forecast ? "f" : "t"},${dateKey(startMs)},${dateKey(end)}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const value = (forecast ? fetchForecast(rounded, startMs, end) : fetchTypical(rounded, startMs)).catch(
    (e) => {
      console.warn("Weather unavailable:", e?.message ?? e);
      cache.delete(key); // try again next time
      return null;
    },
  );
  cache.set(key, {at: Date.now(), value});
  return value;
}

/** Typical temperature through the day: low around 6 AM, high around 3 PM. */
function typicalTempAt(t: TypicalWeather, ms: number): number {
  const d = new Date(ms);
  const h = d.getHours() + d.getMinutes() / 60;
  const rising = h >= 6 && h <= 15;
  const f = rising ? (h - 6) / 9 : 1 - ((h < 6 ? h + 24 : h) - 15) / 15;
  return t.lowF + ((t.highF - t.lowF) * (1 - Math.cos(Math.PI * f))) / 2;
}

/** What it's like at `ms`, or null if outside what we know. */
export function conditionsAt(weather: DateWeather | null | undefined, ms: number): Conditions | null {
  if (!weather) return null;
  if (weather.source === "typical") {
    const t = weather.typical;
    return {
      source: "typical",
      tempF: typicalTempAt(t, ms),
      rainChance: t.rainChance,
      gustMph: t.gustMph,
      snowOnGround: t.snowy,
      code: null,
    };
  }
  const hours = weather.hours;
  if (hours.length === 0 || ms < hours[0].ms - 3_600_000 || ms > hours[hours.length - 1].ms + 3_600_000)
    return null;
  let nearest = hours[0];
  for (const hour of hours) if (Math.abs(hour.ms - ms) < Math.abs(nearest.ms - ms)) nearest = hour;
  return {
    source: "forecast",
    tempF: nearest.tempF,
    rainChance: nearest.rainChance,
    gustMph: nearest.gustMph,
    snowOnGround: nearest.snowDepthIn >= 0.5,
    code: nearest.code,
  };
}

export const weatherLookup =
  (weather: DateWeather | null | undefined): WeatherLookup =>
  (ms) =>
    conditionsAt(weather, ms);

// ─── Display ───────────────────────────────────────────────────────────────────

type IconName =
  | "sunny"
  | "moon"
  | "partly-sunny"
  | "cloudy-night"
  | "cloudy"
  | "rainy"
  | "snow"
  | "thunderstorm"
  | "water";

/** WMO weather code -> worst-first rank, icon and words. */
export function describeCode(code: number, night = false): {rank: number; icon: IconName; label: string} {
  if (code >= 95) return {rank: 8, icon: "thunderstorm", label: "Thunderstorms"};
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return {rank: 7, icon: "snow", label: "Snow"};
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return {rank: 6, icon: "rainy", label: "Rain"};
  if (code >= 51 && code <= 57) return {rank: 5, icon: "water", label: "Drizzle"};
  if (code === 45 || code === 48) return {rank: 4, icon: "cloudy", label: "Fog"};
  if (code === 3) return {rank: 3, icon: "cloudy", label: "Cloudy"};
  if (code === 1 || code === 2)
    return {rank: 2, icon: night ? "cloudy-night" : "partly-sunny", label: "Partly cloudy"};
  return {rank: 1, icon: night ? "moon" : "sunny", label: "Clear"};
}

/** The hours of the forecast that fall within the date. */
export function hoursWithin(weather: DateWeather | null | undefined, startMs: number, endMs: number) {
  if (!weather || weather.source !== "forecast") return [];
  return weather.hours.filter((h) => h.ms >= startMs - 30 * 60_000 && h.ms <= endMs);
}
