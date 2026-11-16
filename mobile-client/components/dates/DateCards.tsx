// components/dates/DateCards.tsx
// Cards for saved dates, shared by the Profile and Activity tabs.

import React from "react";
import {IMAGE_SIZE, sizedImage} from "@/src/lib/images";
import {View, Text, Pressable} from "react-native";
import {Image} from "expo-image";
import {Ionicons} from "@expo/vector-icons";
import {router} from "expo-router";

import type {Itinerary} from "@/types/dates";
import {
  countdownLabel,
  coverImage,
  formatShortDate,
  formatTimeOfDay,
  stopCountLabel,
  stopProgress,
} from "@/src/lib/dates";

const openDate = (itinerary: Itinerary) =>
  router.push({
    pathname: "/itinerary/[id]",
    params: {id: String(itinerary.itinerary_id)},
  });

/** Profile tab: the next thing on the calendar (or what's happening now). */
export function UpNextCard({itinerary}: {itinerary: Itinerary}) {
  const isLive = itinerary.status === "ACTIVE";
  const firstStop = itinerary.stops.find((s) => s.activity)?.activity;

  return (
    <Pressable
      onPress={() => (isLive ? router.push("/active-date") : openDate(itinerary))}
      className="bg-blue-600/10 border border-blue-500/30 rounded-3xl p-5 active:opacity-70"
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2 flex-1">
          <Ionicons
            name={isLive ? "radio-outline" : "calendar"}
            size={16}
            color="#60A5FA"
          />
          <Text
            className="text-blue-400 font-bold text-sm uppercase tracking-wider"
            numberOfLines={1}
          >
            {isLive
              ? "Happening now"
              : `${countdownLabel(itinerary.starts_at)} • ${formatTimeOfDay(itinerary.starts_at)}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#60A5FA" />
      </View>
      <Text className="text-white font-bold text-xl mb-1" numberOfLines={1}>
        {itinerary.title}
      </Text>
      <Text className="text-blue-100/70 text-sm font-medium" numberOfLines={1}>
        {firstStop?.venues?.name ?? stopCountLabel(itinerary)}
      </Text>
    </Pressable>
  );
}

/** Profile tab: a finished date. */
export function PastDateCard({itinerary}: {itinerary: Itinerary}) {
  return (
    <Pressable
      onPress={() => openDate(itinerary)}
      className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 active:opacity-80"
    >
      <View className="h-32 w-full">
        <Image
          source={{uri: coverImage(itinerary)}}
          style={{width: "100%", height: "100%"}}
          contentFit="cover"
        />
        <View className="absolute inset-0 bg-black/30" />
      </View>
      <View className="p-4">
        <Text className="text-white font-bold text-xl mb-1" numberOfLines={1}>
          {itinerary.title}
        </Text>
        <Text className="text-zinc-400 text-sm">
          {formatShortDate(itinerary.starts_at)} • {stopCountLabel(itinerary)}
        </Text>
      </View>
    </Pressable>
  );
}

/** Activity tab: a planned date, styled like a ticket. */
export function UpcomingDateCard({itinerary}: {itinerary: Itinerary}) {
  const start = new Date(itinerary.starts_at);
  const month = start.toLocaleDateString([], {month: "short"}).toUpperCase();
  const weekday = start.toLocaleDateString([], {weekday: "long"});

  return (
    <Pressable
      onPress={() => openDate(itinerary)}
      className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 active:opacity-90"
    >
      {/* Ticket stub */}
      <View className="flex-row items-center justify-between bg-zinc-800/50 p-4 border-b border-zinc-800">
        <View className="flex-row items-center gap-3">
          <View className="bg-black py-1 px-3 rounded-xl border border-zinc-700 items-center">
            <Text className="text-red-400 font-bold text-[10px] uppercase">
              {month}
            </Text>
            <Text className="text-white font-bold text-lg">
              {start.getDate()}
            </Text>
          </View>
          <View>
            <Text className="text-white font-bold text-base">{weekday}</Text>
            <Text className="text-zinc-400 text-sm">
              {formatTimeOfDay(start)}
            </Text>
          </View>
        </View>
        <Text className="text-zinc-300 font-bold text-sm bg-zinc-700/50 px-2 py-1 rounded-md overflow-hidden">
          {countdownLabel(start)}
        </Text>
      </View>

      {/* Image + details */}
      <View className="h-32 w-full">
        <Image
          source={{uri: coverImage(itinerary)}}
          style={{width: "100%", height: "100%"}}
          contentFit="cover"
        />
        <View className="absolute inset-0 bg-black/40" />
        <View className="absolute bottom-4 left-4 right-4">
          <Text className="text-white font-bold text-xl" numberOfLines={1}>
            {itinerary.title}
          </Text>
          <Text className="text-zinc-200 text-sm font-medium mt-1">
            {stopCountLabel(itinerary)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Activity tab: the date in progress, with its current or next stop. */
export function LiveDateCard({itinerary}: {itinerary: Itinerary}) {
  const {stops, current, next, position} = stopProgress(itinerary);
  const focus = current ?? next;

  return (
    <Pressable
      onPress={() => router.push("/active-date")}
      className="bg-zinc-900 rounded-3xl overflow-hidden border border-[#FF9D0A]/30 active:opacity-90"
    >
      <View className="h-40 w-full">
        <Image
          source={{uri: sizedImage(focus?.activity?.image_urls?.[0], IMAGE_SIZE.full) ?? coverImage(itinerary)}}
          style={{width: "100%", height: "100%", opacity: 0.6}}
          contentFit="cover"
        />
        <View className="absolute top-4 left-4 bg-black/80 px-3 py-1.5 rounded-full border border-zinc-700 flex-row items-center gap-1.5">
          <Ionicons name="navigate" size={14} color="#FF9D0A" />
          <Text className="text-white font-bold text-xs">
            Stop {position} of {stops.length}
          </Text>
        </View>
      </View>

      <View className="p-5 pt-3">
        <Text className="text-white font-bold text-2xl mb-1" numberOfLines={1}>
          {itinerary.title}
        </Text>

        <View className="flex-row items-center justify-between mt-3 bg-black/50 p-4 rounded-2xl border border-zinc-800">
          <View className="flex-1 pr-3">
            <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">
              {current ? "Now" : next ? "Up next" : "Last stop"}
            </Text>
            <Text className="text-white font-bold text-base" numberOfLines={1}>
              {focus?.activity?.title ?? stops[stops.length - 1]?.activity?.title}
            </Text>
            {focus?.starts_at && (
              <Text className="text-zinc-500 text-sm mt-0.5">
                {current ? "Until" : "At"}{" "}
                {formatTimeOfDay(current ? focus.ends_at! : focus.starts_at)}
              </Text>
            )}
          </View>
          <View className="bg-[#FF9D0A] w-12 h-12 rounded-full items-center justify-center">
            <Ionicons name="map" size={20} color="black" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
