// components/ideas/SaveButton.tsx
// Bookmark toggle for an idea. Reads and writes the Bucket List store, so
// every card showing the same idea stays in sync. With a partner (#35): a
// new save is shared with them (the toast offers "keep private"), and a
// long press saves privately, or switches a save between shared and private.

import React from "react";
import {Pressable, View, StyleSheet} from "react-native";
import {Ionicons} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Toast from "@/src/lib/toast";

import GlassSurface from "@/components/ui/GlassSurface";

import {useSavedStore} from "@/src/store/useSavedStore";
import {useSaveTipStore} from "@/src/store/useSaveTipStore";
import {usePartner} from "@/src/store/useConnectionsStore";

export const SAVED_COLOR = "#FF9D0A";
/** A private save (with a partner, #35): a light bookmark with a lock */
export const PRIVATE_SAVED_COLOR = "#e4e4e7";
const LOCK_COLOR = "#f472b6";

export default function SaveButton({
  ideaId,
  size = 36,
  variant = "overlay",
}: {
  ideaId: number;
  size?: number;
  /**
   * overlay: dark circle for photos in lists.
   * glass: tinted Liquid Glass circle (matches the tab headers' buttons).
   * plain: just the icon, for rows.
   */
  variant?: "overlay" | "glass" | "plain";
}) {
  const saved = useSavedStore((s) => s.ids.has(ideaId));
  const toggle = useSavedStore((s) => s.toggle);
  const partner = usePartner();
  const partnerName = partner ? `@${partner.username}` : null;
  // Only different with a partner (otherwise everything's just yours)
  const savedPrivately = useSavedStore((s) => s.privateIds.has(ideaId)) && !!partnerName;

  /** Say who sees it, with a one-tap way to switch */
  const announce = (shared: boolean) => {
    if (!partnerName) return;
    Toast.show({
      type: "success",
      text1: shared ? `Saved · shared with ${partnerName}` : "Saved privately",
      text2: shared ? "Tap to keep it private" : `${partnerName} won't see it`,
      onPress: shared
        ? () => {
            Toast.hide();
            useSavedStore
              .getState()
              .setShared(ideaId, false)
              .then(() => Toast.show({type: "success", text1: "Kept private"}))
              .catch(() => {});
          }
        : undefined,
    });
  };

  const onPress = async () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(
        saved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
      );
    }
    try {
      const nowSaved = await toggle(ideaId);
      if (nowSaved) {
        // The first save with a partner: how tap and long-press differ
        if (partnerName && (await useSaveTipStore.getState().showOnce(ideaId))) return;
        announce(true);
      }
    } catch (e) {
      Toast.show({
        type: "error",
        text1: saved ? "Couldn't remove it" : "Couldn't save it",
        text2: e instanceof Error ? e.message : undefined,
      });
    }
  };

  // Long press (with a partner): save privately, or switch shared / private
  const onLongPress = async () => {
    if (!partnerName) return;
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const store = useSavedStore.getState();
    try {
      if (!saved) {
        await store.toggle(ideaId, {shared: false});
        announce(false);
        return;
      }
      const shared = store.items.find((i) => i.activity_id === ideaId)?.shared ?? false;
      await store.setShared(ideaId, !shared);
      Toast.show({
        type: "success",
        text1: shared ? "Kept private" : `Shared with ${partnerName}`,
      });
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Couldn't change that",
        text2: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const iconSize = Math.round(size * 0.5);
  // Whole pixels, so the lock sits dead centre in its circle
  const lockBox = Math.round(iconSize * 0.62);
  const lockIcon = Math.round(lockBox * 0.62);
  const icon = (
    <View>
      <Ionicons
        name={saved ? "bookmark" : "bookmark-outline"}
        size={iconSize}
        color={saved ? (savedPrivately ? PRIVATE_SAVED_COLOR : SAVED_COLOR) : "white"}
      />
      {/* Private: a small lock on the bookmark's corner */}
      {saved && savedPrivately && (
        <View style={[styles.lock, {width: lockBox, height: lockBox, borderRadius: lockBox / 2}]}>
          <Ionicons
            name="lock-closed"
            size={lockIcon}
            color="white"
            // The icon font's line box sits the glyph low: pin it to a square
            style={{width: lockIcon, height: lockIcon, lineHeight: lockIcon, textAlign: "center"}}
          />
        </View>
      )}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      onLongPress={partnerName ? onLongPress : undefined}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        saved
          ? savedPrivately
            ? "Saved privately. Remove from Saved"
            : "Remove from Saved"
          : "Save"
      }
      accessibilityHint={partnerName ? "Press and hold to save privately, or switch shared and private" : undefined}
      accessibilityState={{selected: saved}}
      className="active:opacity-70"
    >
      {variant === "glass" ? (
        <GlassSurface style={[styles.center, {width: size, height: size, borderRadius: size / 2}]}>
          {icon}
        </GlassSurface>
      ) : variant === "overlay" ? (
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
  center: {alignItems: "center", justifyContent: "center"},
  lock: {
    position: "absolute",
    right: -5,
    bottom: -3,
    backgroundColor: LOCK_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    // (matches the pills on Explore's cards)
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.3)",
  },
});
