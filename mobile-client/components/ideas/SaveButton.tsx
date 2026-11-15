// components/ideas/SaveButton.tsx
// Bookmark toggle for an idea. Reads and writes the Bucket List store, so
// every card showing the same idea stays in sync.

import React from "react";
import {Pressable, View, StyleSheet} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Toast from "react-native-toast-message";

import {useSavedStore} from "@/src/store/useSavedStore";

export const SAVED_COLOR = "#FF9D0A";

export default function SaveButton({
  ideaId,
  size = 36,
  variant = "overlay",
}: {
  ideaId: number;
  size?: number;
  /** overlay: dark circle for photos. plain: just the icon, for rows. */
  variant?: "overlay" | "plain";
}) {
  const saved = useSavedStore((s) => s.ids.has(ideaId));
  const toggle = useSavedStore((s) => s.toggle);

  const onPress = async () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(
        saved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
      );
    }
    try {
      await toggle(ideaId);
    } catch (e) {
      Toast.show({
        type: "error",
        text1: saved ? "Couldn't remove it" : "Couldn't save it",
        text2: e instanceof Error ? e.message : undefined,
        position: "bottom",
      });
    }
  };

  const icon = (
    <Ionicons
      name={saved ? "bookmark" : "bookmark-outline"}
      size={Math.round(size * 0.5)}
      color={saved ? SAVED_COLOR : "white"}
    />
  );

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={saved ? "Remove from bucket list" : "Save to bucket list"}
      accessibilityState={{selected: saved}}
      className="active:opacity-70"
    >
      {variant === "overlay" ? (
        <View
          style={[
            styles.overlay,
            {width: size, height: size, borderRadius: size / 2},
          ]}
        >
          {icon}
        </View>
      ) : (
        <View style={{width: size, height: size, alignItems: "center", justifyContent: "center"}}>
          {icon}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.3)",
  },
});
