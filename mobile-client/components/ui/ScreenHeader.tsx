import React from "react";
import {View, Text, Pressable} from "react-native";
import {useRouter} from "expo-router";
import {Ionicons} from "@expo/vector-icons";

/** Header for pushed screens: back chevron, title, optional right slot. */
export default function ScreenHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between px-4 py-2">
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="w-10 h-10 rounded-full items-center justify-center active:bg-zinc-900"
      >
        <Ionicons name="chevron-back" size={24} color="white" />
      </Pressable>
      <Text className="text-white font-bold text-lg tracking-tight">
        {title}
      </Text>
      <View className="w-10 h-10 items-center justify-center">{right}</View>
    </View>
  );
}
