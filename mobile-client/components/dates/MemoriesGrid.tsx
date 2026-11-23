// components/dates/MemoriesGrid.tsx
// Memories (#44): your past dates as a photo grid, newest first, one square
// per date. Each date's cover is its end-of-date photo, or the last photo
// taken on it; a date with no photos shows one of its ideas' pictures.
// Tap one to open the date, with all its photos (app/itinerary/[id].tsx).
//
// Rows of three that share the width (flex: 1, square), not measured tile
// sizes: those round to the pixel grid and the third one wrapped.

import React, {useEffect} from "react";
import {Pressable, Text, View} from "react-native";
import {Image} from "expo-image";
import {LinearGradient} from "expo-linear-gradient";
import {Ionicons} from "@expo/vector-icons";
import {router} from "expo-router";

import type {Itinerary} from "@/types/dates";
import {coverImage} from "@/src/lib/dates";
import {coverPhoto} from "@/src/lib/captures";
import {IMAGE_SIZE} from "@/src/lib/images";
import {useCaptureStore} from "@/src/store/useCaptureStore";

const COLUMNS = 3;
const GAP = 3;

export default function MemoriesGrid({dates}: {dates: Itinerary[]}) {
  const byDate = useCaptureStore((s) => s.byDate);
  const load = useCaptureStore((s) => s.load);

  // The photos on these dates (again when the list changes)
  const ids = dates.map((d) => d.itinerary_id).join(",");
  useEffect(() => {
    if (ids) load(ids.split(",").map(Number));
  }, [ids, load]);

  const rows: Itinerary[][] = [];
  for (let i = 0; i < dates.length; i += COLUMNS) rows.push(dates.slice(i, i + COLUMNS));

  return (
    <View className="rounded-2xl overflow-hidden" style={{gap: GAP}}>
      {rows.map((row) => (
        <View key={row[0].itinerary_id} className="flex-row" style={{gap: GAP}}>
          {row.map((date) => {
            const photos = byDate[date.itinerary_id] ?? [];
            const cover = coverPhoto(photos);
            const day = new Date(date.starts_at);
            const label = day.toLocaleDateString([], {
              month: "short",
              day: "numeric",
              ...(day.getFullYear() !== new Date().getFullYear() ? {year: "2-digit"} : {}),
            });
            return (
              <Pressable
                key={date.itinerary_id}
                onPress={() => router.push({pathname: "/itinerary/[id]", params: {id: String(date.itinerary_id)}})}
                accessibilityRole="button"
                accessibilityLabel={`${date.title}, ${label}${photos.length ? `, ${photos.length} photos` : ""}`}
                className="active:opacity-80"
                style={{flex: 1, aspectRatio: 1}}
              >
                <Image
                  source={
                    cover
                      ? {uri: cover.thumbUrl ?? undefined, cacheKey: cover.thumb_path ?? cover.storage_path}
                      : {uri: coverImage(date, IMAGE_SIZE.card)}
                  }
                  style={{width: "100%", height: "100%", backgroundColor: "#18181b"}}
                  contentFit="cover"
                  transition={150}
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.65)"]}
                  style={{position: "absolute", left: 0, right: 0, bottom: 0, height: "45%"}}
                />
                <View className="absolute left-2 right-2 bottom-1.5">
                  <Text className="text-white font-bold text-xs" numberOfLines={1}>
                    {date.title}
                  </Text>
                  <Text className="text-zinc-300 text-[10px] font-semibold">{label}</Text>
                </View>
                {photos.length > 0 && (
                  <View className="absolute top-1.5 right-1.5 flex-row items-center gap-0.5 bg-black/50 rounded-full px-1.5 py-0.5">
                    <Ionicons name="images" size={10} color="white" />
                    {photos.length > 1 && <Text className="text-white text-[10px] font-bold">{photos.length}</Text>}
                  </View>
                )}
              </Pressable>
            );
          })}
          {/* A short last row keeps its squares the same size */}
          {Array.from({length: COLUMNS - row.length}, (_, i) => (
            <View key={`empty-${i}`} style={{flex: 1}} />
          ))}
        </View>
      ))}
    </View>
  );
}
