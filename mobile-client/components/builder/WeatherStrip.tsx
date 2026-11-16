// components/builder/WeatherStrip.tsx
// The planned date's weather, in a small card in the builder: what it'll be
// like over the date's hours, so the plan has context. Forecast hours when
// the date is close enough; otherwise typical weather for that week.

import React from "react";
import {View, Text, ScrollView} from "react-native";
import {Ionicons} from "@expo/vector-icons";

import {type DateWeather, describeCode, hoursWithin} from "@/src/lib/weather";
import {sunsetAt} from "@/utils/sunset";

const hourLabel = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: "numeric"}).replace(/\s/g, "").toLowerCase();

function WeatherStripView({
  weather,
  startMs,
  endMs,
  place,
}: {
  /** undefined while loading, null when unavailable */
  weather: DateWeather | null | undefined;
  startMs: number;
  endMs: number;
  place: {latitude: number; longitude: number} | null;
}) {
  if (weather === null) return null;

  if (weather === undefined) {
    return (
      <View className="mx-5 mb-6 flex-row items-center gap-2 bg-zinc-950 border border-zinc-900 rounded-2xl px-4 py-3">
        <Ionicons name="partly-sunny-outline" size={16} color="#52525b" />
        <Text className="text-zinc-500 text-sm">Checking the weather…</Text>
      </View>
    );
  }

  const sunset = place ? sunsetAt(new Date(startMs), place.latitude, place.longitude) : null;
  const isNight = (ms: number) => {
    const h = new Date(ms).getHours();
    return (sunset ? ms >= sunset.getTime() : h >= 18) || h < 6;
  };

  let icon: React.ComponentProps<typeof Ionicons>["name"];
  let headline: string;
  let detail: string;
  let hours: ReturnType<typeof hoursWithin> = [];

  if (weather.source === "forecast") {
    hours = hoursWithin(weather, startMs, endMs).slice(0, 14);
    if (hours.length === 0) return null;
    const worst = hours.reduce((a, b) =>
      describeCode(b.code).rank > describeCode(a.code).rank ? b : a,
    );
    const look = describeCode(worst.code, isNight(worst.ms));
    const temps = hours.map((h) => h.tempF);
    const rain = Math.max(...hours.map((h) => h.rainChance));
    const gust = Math.max(...hours.map((h) => h.gustMph));
    icon = look.icon;
    headline = `${look.label} · ${Math.round(Math.max(...temps))}° / ${Math.round(Math.min(...temps))}°`;
    detail = [
      `Rain ${Math.round(rain)}%`,
      gust >= 15 ? `Gusts ${Math.round(gust)} mph` : null,
      sunset && sunset.getTime() > startMs && sunset.getTime() < endMs
        ? `Sunset ${sunset.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    const t = weather.typical;
    icon = t.snowy ? "snow" : t.rainChance >= 40 ? "rainy" : t.highF < 50 ? "cloudy" : "partly-sunny";
    headline = `Usually ${Math.round(t.highF)}° / ${Math.round(t.lowF)}°`;
    detail = [
      t.rainChance >= 15 ? `Rain on ${Math.round(t.rainChance)}% of days` : "Usually dry",
      t.snowy ? "Often snowy" : null,
      t.gustMph >= 20 ? "Often windy" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <View
      className="mx-5 mb-6 bg-zinc-950 border border-zinc-900 rounded-3xl px-4 py-3.5 gap-3"
      accessible
      accessibilityLabel={`Weather: ${headline}. ${detail}`}
    >
      <View className="flex-row items-center gap-3">
        <View className="w-10 h-10 rounded-full bg-zinc-900 items-center justify-center">
          <Ionicons name={icon} size={20} color="#e4e4e7" />
        </View>
        <View className="flex-1">
          <Text className="text-white font-bold text-base" numberOfLines={1}>
            {headline}
          </Text>
          <Text className="text-zinc-400 text-xs" numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Text className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
          {weather.source === "forecast" ? "Forecast" : "Typical"}
        </Text>
      </View>

      {hours.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap: 14, paddingRight: 4}}
        >
          {hours.map((h) => {
            const look = describeCode(h.code, isNight(h.ms));
            return (
              <View key={h.ms} className="items-center gap-1" style={{minWidth: 34}}>
                <Text className="text-zinc-500 text-[11px] font-semibold">{hourLabel(h.ms)}</Text>
                <Ionicons name={look.icon} size={16} color={h.rainChance >= 50 ? "#60a5fa" : "#a1a1aa"} />
                <Text className="text-white text-xs font-bold">{Math.round(h.tempF)}°</Text>
                {h.rainChance >= 20 && (
                  <Text className="text-blue-400 text-[10px] font-semibold">{Math.round(h.rainChance)}%</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {weather.source === "typical" && (
        <Text className="text-zinc-600 text-[11px]">
          Too far out for a forecast. This is typical for this week over the past{" "}
          {weather.typical.years} years.
        </Text>
      )}
    </View>
  );
}

type WeatherStripProps = React.ComponentProps<typeof WeatherStripView>;

export default React.memo(
  WeatherStripView,
  (a: WeatherStripProps, b: WeatherStripProps) =>
    a.weather === b.weather &&
    a.startMs === b.startMs &&
    a.endMs === b.endMs &&
    a.place?.latitude === b.place?.latitude &&
    a.place?.longitude === b.place?.longitude,
);
