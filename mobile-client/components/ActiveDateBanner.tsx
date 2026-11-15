import React from "react";
import {View, Text, Pressable} from "react-native";
import {router} from "expo-router";
import {NativeTabs} from "expo-router/native-tabs";
import {Ionicons} from "@expo/vector-icons";

import {useActiveDateStore} from "@/src/store/activeDateStore";

const openActiveDate = () => router.push("/active-date");

/**
 * "Date in progress" row for the iOS 26 tab bar's bottom accessory (the glass
 * capsule above the tabs, like Apple Music's mini player). The system draws
 * the glass; this is just the content. When the tab bar is minimized the
 * accessory sits inline next to it, so it gets a shorter layout.
 */
export function ActiveDateAccessory() {
  const socialType = useActiveDateStore((s) => s.userPrefs.socialType);
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const inline = placement === "inline";

  return (
    <Pressable
      onPress={openActiveDate}
      accessibilityRole="button"
      accessibilityLabel="Return to your date in progress"
      className="flex-1 flex-row items-center px-4 gap-3"
    >
      <View className="w-2.5 h-2.5 rounded-full bg-[#FF9D0A]" />
      <View className="flex-1">
        <Text className="text-white font-bold text-[15px]" numberOfLines={1}>
          {inline
            ? "Live"
            : `${socialType === "Group-Date" ? "Group date" : socialType} in progress`}
        </Text>
        {!inline && (
          <Text className="text-zinc-400 text-xs" numberOfLines={1}>
            Tap to return to your itinerary
          </Text>
        )}
      </View>
      <Ionicons name="map" size={18} color="white" />
    </Pressable>
  );
}

/** Floating banner for tab bars without an accessory slot (Android, iOS < 26). */
export default function ActiveDateBanner() {
  const timeline = useActiveDateStore((state) => state.timeline);
  const userPrefs = useActiveDateStore((state) => state.userPrefs);

  // If there is no active date, hide the banner completely!
  if (!timeline) return null;

  return (
    <Pressable
      onPress={openActiveDate}
      className="absolute bottom-[90px] left-4 right-4 bg-blue-600 rounded-2xl p-4 flex-row items-center justify-between shadow-lg shadow-blue-900/50 z-50"
    >
      <View className="flex-row items-center flex-1">
        <View className="bg-white/20 w-10 h-10 rounded-full items-center justify-center mr-3">
          <Ionicons name="map" size={20} color="white" />
        </View>
        <View>
          <Text className="text-white font-bold text-base">
            {userPrefs.socialType} in Progress
          </Text>
          <Text className="text-blue-200 text-xs">
            Tap to return to your itinerary
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="white" />
    </Pressable>
  );
}
