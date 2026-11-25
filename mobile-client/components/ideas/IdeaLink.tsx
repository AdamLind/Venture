// components/ideas/IdeaLink.tsx
// An idea's link, as a button on its page: its title ("The 36 questions",
// "Menu"; "Website" without one) with the link under it, so you can see
// where it goes before you tap.

import React from "react";
import {Linking, Pressable, Text, View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import {linkHref, linkText} from "@/src/lib/links";

export default function IdeaLink({url, label, className = ""}: {url: string; label?: string | null; className?: string}) {
  const title = label?.trim() || "Website";
  const shown = linkText(url);
  return (
    <Pressable
      onPress={() => Linking.openURL(linkHref(url)).catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel={`${title}. Opens ${shown}`}
      className={`flex-row items-center gap-3 bg-zinc-900/80 border border-zinc-800 rounded-3xl p-4 active:opacity-80 ${className}`}
    >
      <View className="w-10 h-10 rounded-full bg-blue-500/15 items-center justify-center">
        <Ionicons name="link" size={18} color="#60a5fa" />
      </View>
      <View className="flex-1">
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={1}>
          {shown}
        </Text>
      </View>
      <Ionicons name="open-outline" size={18} color="#71717a" />
    </Pressable>
  );
}
