// components/settings/SuspensionNotice.tsx
// "Your account is suspended" at the top of Settings (#76). Open the first
// time someone sees a suspension, folded after that (tap to read it again).
// A new suspension opens it again.

import React, {useEffect, useState} from "react";
import {LayoutAnimation, Pressable, Text, View} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {Ionicons} from "@expo/vector-icons";

import {SUSPENDED_MESSAGE, type Suspension} from "@/src/store/useAccountStore";

const seenKey = (userId: string) => `venture.suspensionSeen.${userId}`;

export default function SuspensionNotice({userId, suspension}: {userId: string; suspension: Suspension}) {
  // null: still checking whether it's been seen (nothing shown yet)
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      let seen: string | null = null;
      try {
        seen = await AsyncStorage.getItem(seenKey(userId));
      } catch {
        // Can't tell: show it open
      }
      const firstTime = seen !== suspension.created_at;
      if (active) setOpen(firstTime);
      if (firstTime) AsyncStorage.setItem(seenKey(userId), suspension.created_at).catch(() => {});
    })();
    return () => {
      active = false;
    };
  }, [userId, suspension.created_at]);

  if (open === null) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityState={{expanded: open}}
      accessibilityHint={open ? "Hides the details" : "Shows why and what it means"}
      className="bg-red-500/10 border border-red-500/30 rounded-3xl px-4 py-3.5 -mb-4 active:opacity-80"
    >
      <View className="flex-row items-center gap-3">
        <Ionicons name="ban-outline" size={20} color="#f87171" />
        <Text className="text-red-300 font-bold text-base flex-1">Your account is suspended</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#f87171" />
      </View>
      {open && (
        <View className="gap-1 mt-2 ml-8">
          <Text className="text-zinc-300 text-sm">{SUSPENDED_MESSAGE}</Text>
          <Text className="text-zinc-400 text-sm">Reason: {suspension.reason}</Text>
        </View>
      )}
    </Pressable>
  );
}
