// components/connections/ConnectionSheet.tsx
// Tap a connection (#35): who they are, shown properly (a big photo, their
// name, how long you've been connected), and what you can do. Your partner's
// version is warmer, with the dates that matter below (#87:
// components/connections/PartnerDetails.tsx). Replaces the system action
// sheet (#86).
//
// Drags closed like an iOS sheet (the same way as components/builder/
// PickerSheet.tsx): the grabber and their photo drag it down, and so does
// the rest once it's scrolled to the top. Let go a quarter of the way down
// (or flick) and it closes at your speed; otherwise it springs back. On the
// UI thread (Reanimated + gesture handler). Android's back button closes it.
//
// Tap their photo to see it full screen (a layer inside the sheet's own
// window: a second Modal on top of this one misbehaves on iOS).

import React, {useEffect, useState} from "react";
import {Modal, Pressable, StyleSheet, Text, View, useWindowDimensions} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Image} from "expo-image";
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {scheduleOnRN} from "react-native-worklets";
import {GestureDetector, GestureHandlerRootView, useNativeGesture, usePanGesture} from "react-native-gesture-handler";
import {Ionicons} from "@expo/vector-icons";

import Avatar from "@/components/profile/Avatar";
import PartnerDetails, {PARTNER_COLOR} from "@/components/connections/PartnerDetails";
import {type Connection, connectionName} from "@/src/lib/connections";

export type SheetAction = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  /** Ends or removes something (shown in red) */
  destructive?: boolean;
  run: () => void;
};

const OPEN_MS = 380;
const CLOSE_MS = 300;
/** Dragged this share of its height down (or flicked), it closes */
const CLOSE_SHARE = 0.25;
/** Points per second */
const CLOSE_VELOCITY = 900;
const SPRING_BACK = {damping: 24, stiffness: 240, overshootClamping: true};
/** A downward move this far starts a drag (taps don't) */
const DRAG_START = 8;
/** "Not yet at the top" (the pull hasn't reached the sheet) */
const NOT_AT_TOP = -1e9;
/** The tallest it gets, as a share of the screen */
const MAX_HEIGHT = 0.88;

export default function ConnectionSheet({
  connection,
  actions,
  onClose,
}: {
  /** Who to show (null: closed) */
  connection: Connection | null;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const {height: windowHeight} = useWindowDimensions();
  const visible = !!connection;

  // Stays mounted, showing who it showed, while it slides away
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const [shown, setShown] = useState<{who: Connection; actions: SheetAction[]} | null>(
    connection ? {who: connection, actions} : null,
  );
  if (connection && (shown?.who !== connection || shown.actions !== actions)) {
    setShown({who: connection, actions});
  }

  // 0 closed .. 1 open; how far it's dragged down; the list's scroll, and
  // where the pull was when the list reached its top
  // Their photo, full screen
  const [photoOpen, setPhotoOpen] = useState(false);
  if (!visible && photoOpen) setPhotoOpen(false);

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const sheetHeight = useSharedValue(windowHeight * 0.6);
  const scrollY = useSharedValue(0);
  const topAt = useSharedValue(NOT_AT_TOP);
  const listRef = useAnimatedRef<Reanimated.ScrollView>();

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      dragY.set(0);
      scrollY.set(0);
      progress.set(withTiming(1, {duration: OPEN_MS, easing: Easing.out(Easing.cubic)}));
    } else {
      progress.set(
        withTiming(0, {duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic)}, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, mounted, progress, dragY, scrollY]);

  // Let go: close (carrying on at your speed) or spring back
  const release = (velocityY: number) => {
    "worklet";
    const pulled = dragY.get();
    if (pulled <= 0) return;
    const height = sheetHeight.get();
    if (pulled > height * CLOSE_SHARE || velocityY > CLOSE_VELOCITY) {
      const remaining = Math.max(0, height - pulled);
      const speed = Math.max(velocityY, 1200) / 1000;
      const duration = Math.min(300, Math.max(120, (2 * remaining) / speed));
      dragY.set(
        withTiming(height + 40, {duration, easing: Easing.out(Easing.quad)}, (finished) => {
          if (finished) scheduleOnRN(onClose);
        }),
      );
    } else {
      dragY.set(withSpring(0, SPRING_BACK));
    }
  };

  // The grabber and their photo: a plain downward drag
  const headerPan = usePanGesture({
    enabled: visible,
    activeOffsetY: DRAG_START,
    onUpdate: (e) => {
      "worklet";
      dragY.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      "worklet";
      release(e.velocityY);
    },
  });

  // The rest scrolls, and a pull at its top moves the sheet
  const listScroll = useNativeGesture({});
  const listPan = usePanGesture({
    enabled: visible,
    activeOffsetY: DRAG_START,
    simultaneousWith: listScroll,
    onActivate: (e) => {
      "worklet";
      topAt.set(scrollY.get() <= 0.5 ? e.translationY : NOT_AT_TOP);
    },
    onUpdate: (e) => {
      "worklet";
      if (topAt.get() === NOT_AT_TOP) {
        if (scrollY.get() > 0.5) return;
        topAt.set(e.translationY);
      }
      const pulled = Math.max(0, e.translationY - topAt.get());
      dragY.set(pulled);
      if (pulled > 0) scrollTo(listRef, 0, 0, false);
    },
    onDeactivate: (e) => {
      "worklet";
      topAt.set(NOT_AT_TOP);
      release(e.velocityY);
    },
  });

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{translateY: (1 - progress.get()) * (sheetHeight.get() + 40) + dragY.get()}],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.get() * (1 - Math.min(1, Math.max(0, dragY.get() / Math.max(1, sheetHeight.get())))),
  }));

  if (!mounted || !shown) return null;
  const who = shown.who;
  const partner = who.is_partner;
  const since = new Date(who.connected_at).toLocaleDateString([], {month: "long", year: "numeric"});
  const photo = who.profile_image_url;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      // Back closes the photo first, then the sheet
      onRequestClose={() => (photoOpen ? setPhotoOpen(false) : onClose())}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{flex: 1}}>
        {/* Backdrop: fades, and lightens as you drag */}
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable className="flex-1 bg-black/60" onPress={onClose} accessibilityLabel="Close" />
        </Reanimated.View>

        <Reanimated.View
          style={[{position: "absolute", left: -1, right: -1, bottom: -1, maxHeight: windowHeight * MAX_HEIGHT}, sheetStyle]}
          onLayout={(e) => sheetHeight.set(e.nativeEvent.layout.height)}
          accessibilityViewIsModal
        >
          <View
            className="bg-zinc-950 rounded-t-[32px] border border-zinc-800"
            style={{paddingBottom: Math.max(insets.bottom, 16)}}
          >
            {/* The drag handle: grabber + who they are */}
            <GestureDetector gesture={headerPan}>
              <View className="items-center gap-3 px-5 pb-4" accessibilityHint="Drag down to close">
                <View className="items-center pt-3 pb-2">
                  <View className="w-10 h-1.5 rounded-full bg-zinc-700" />
                </View>
                <Pressable
                  onPress={() => setPhotoOpen(true)}
                  disabled={!photo}
                  accessibilityRole={photo ? "imagebutton" : undefined}
                  accessibilityLabel={photo ? `${connectionName(who)}'s photo. Open` : undefined}
                  className="rounded-full p-1 active:opacity-80"
                  style={partner ? {borderWidth: 2, borderColor: PARTNER_COLOR} : undefined}
                >
                  <Avatar profile={who} size={112} />
                </Pressable>
                <View className="items-center gap-0.5">
                  <Text className="text-white font-extrabold text-2xl text-center" numberOfLines={2}>
                    {connectionName(who)}
                  </Text>
                  {who.first_name ? <Text className="text-zinc-400">@{who.username}</Text> : null}
                </View>
                {partner ? (
                  <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{backgroundColor: `${PARTNER_COLOR}1f`}}>
                    <Ionicons name="heart" size={13} color={PARTNER_COLOR} />
                    <Text className="text-sm font-bold" style={{color: PARTNER_COLOR}}>
                      Your partner
                    </Text>
                  </View>
                ) : (
                  <Text className="text-zinc-500 text-sm">Connected since {since}</Text>
                )}
              </View>
            </GestureDetector>

            {/* The rest (pull down at the top to close) */}
            <GestureDetector gesture={listPan}>
              <View style={{flexShrink: 1}}>
                <GestureDetector gesture={listScroll}>
                  <Reanimated.ScrollView
                    ref={listRef}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    bounces={false}
                    overScrollMode="never"
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{paddingHorizontal: 20, paddingBottom: 4, gap: 16}}
                  >
                    {/* THE DATES THAT MATTER (your partner only) */}
                    {partner && <PartnerDetails partnerId={who.user_id} partnerName={who.username} />}

                    {/* WHAT YOU CAN DO */}
                    {shown.actions.length > 0 && (
                      <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
                        {shown.actions.map((action, i) => (
                          <Pressable
                            key={action.label}
                            onPress={action.run}
                            disabled={!visible}
                            accessibilityRole="button"
                            className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-zinc-800 ${
                              i > 0 ? "border-t border-zinc-800" : ""
                            }`}
                          >
                            <Ionicons name={action.icon} size={18} color={action.destructive ? "#f87171" : PARTNER_COLOR} />
                            <Text className={`font-semibold ${action.destructive ? "text-red-400" : "text-white"}`}>
                              {action.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </Reanimated.ScrollView>
                </GestureDetector>
              </View>
            </GestureDetector>
          </View>
        </Reanimated.View>

        {/* THEIR PHOTO, full screen (tap anywhere to close) */}
        {photoOpen && photo && (
          <Reanimated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(150)}
            style={[StyleSheet.absoluteFill, {backgroundColor: "black"}]}
          >
            <Pressable
              onPress={() => setPhotoOpen(false)}
              accessibilityLabel="Close photo"
              style={{flex: 1, justifyContent: "center"}}
            >
              <Image
                source={{uri: photo}}
                style={{width: "100%", height: "100%"}}
                contentFit="contain"
                transition={150}
                accessibilityLabel={`${connectionName(who)}'s photo`}
              />
            </Pressable>
            <Pressable
              onPress={() => setPhotoOpen(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="absolute w-10 h-10 rounded-full bg-zinc-900/80 items-center justify-center active:opacity-70"
              style={{top: insets.top + 12, right: 16}}
            >
              <Ionicons name="close" size={20} color="white" />
            </Pressable>
          </Reanimated.View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}
