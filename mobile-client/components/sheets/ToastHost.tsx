// components/sheets/ToastHost.tsx
// Shows the app's toasts (#86: src/lib/toast.ts): a small pill under the
// status bar / Dynamic Island, centred. Up there it never covers the tab
// bar, a screen's bottom buttons or the keyboard, so nothing has to measure
// anything. (It can sit over a header button for a moment; a swipe up
// clears it. Staying at the very top matters more.)
//
// It eases in with a soft spring and drifts out (a fade with Reduce Motion).
// Drag it: up follows your finger one to one, down gives a little and
// springs back. Let go past a short pull or with a flick and it carries on
// up at your speed. It waits while you're touching it. VoiceOver reads it.
//
// Mounted by the root layout and by components/sheets/Overlays.tsx.

import React, {useEffect, useRef, useState} from "react";
import {AccessibilityInfo, Pressable, StyleSheet, Text, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {scheduleOnRN} from "react-native-worklets";
import {GestureDetector, GestureHandlerRootView, usePanGesture} from "react-native-gesture-handler";
import {Ionicons} from "@expo/vector-icons";

import GlassSurface from "@/components/ui/GlassSurface";

import Toast, {type ToastItem, type ToastState, claimToast, newToastHostId, registerToastHost, useToastStore} from "@/src/lib/toast";

/** The current toast, if this host is the one to show it */
function toastFor(s: ToastState, hostId: number): ToastItem | null {
  if (!s.current) return null;
  if (s.owner != null) return s.owner === hostId ? s.current : null;
  return s.hosts[s.hosts.length - 1] === hostId ? s.current : null;
}

/** Below the status bar / Dynamic Island */
const TOP_GAP = 6;
/** In: unhurried, settles without a bounce you'd notice */
const ENTER_SPRING = {damping: 22, stiffness: 140, mass: 1};
const EXIT_MS = 420;
/** A new one replacing it: out a little quicker */
const SWAP_MS = 220;
const FADE_MS = 220;
/** Pulled up this far (or flicked), it goes */
const DISMISS_PULL = 28;
const DISMISS_VELOCITY = 450;
/** Dragging down: it gives this much per point of finger */
const DOWN_GIVE = 0.22;
const SPRING_BACK = {damping: 20, stiffness: 260};
/** After you let go without dismissing: time left to read it */
const AFTER_TOUCH_MS = 2500;
/** Shown again while it's up: a small side-to-side, then settle */
const SHAKE = [5, -4, 3, -1.5, 0];
const SHAKE_STEP_MS = 55;
/** ...and its border lights up in its color, then fades */
const GLOW_IN_MS = 120;
const GLOW_OUT_MS = 900;

const TONES = {
  error: {icon: "alert-circle", color: "#f87171", title: "text-red-300"},
  success: {icon: "checkmark-circle", color: "#4ade80", title: "text-white"},
  info: {icon: "information-circle", color: "#a1a1aa", title: "text-white"},
} as const;

export default function ToastHost() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [hostId] = useState(newToastHostId);
  useEffect(() => registerToastHost(hostId), [hostId]);

  // The current toast, if this host is the one to show it
  const mine = useToastStore((s) => toastFor(s, hostId));

  // What's on screen (it stays while it leaves)
  const [shown, setShown] = useState<ToastItem | null>(null);
  if (mine && !shown) setShown(mine);

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const glow = useSharedValue(0);
  const height = useSharedValue(80);
  const top = insets.top + TOP_GAP;

  // Timer: hides it when it's been up long enough; waits while touched
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const startTimer = (ms: number, id: number) => {
    stopTimer();
    timer.current = setTimeout(() => Toast.hide(id), ms);
  };
  useEffect(() => stopTimer, []);

  // It's showing: in it comes
  const shownId = shown?.id ?? null;
  const shownRef = useRef<ToastItem | null>(null);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  useEffect(() => {
    const item = shownRef.current;
    if (shownId == null || !item) return;
    claimToast(hostId);
    dragY.set(0);
    progress.set(0);
    progress.set(reduceMotion ? withTiming(1, {duration: FADE_MS}) : withSpring(1, ENTER_SPRING));
    startTimer(item.duration, item.id);
    AccessibilityInfo.announceForAccessibility(item.text2 ? `${item.text1}. ${item.text2}` : item.text1);
    // (once per toast, by its id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownId]);

  // The same one again: a small shake, its border lights up, a light tap,
  // and its time starts over
  const nudges = mine && shown && mine.id === shown.id ? mine.nudges : 0;
  useEffect(() => {
    const item = shownRef.current;
    if (!nudges || !item) return;
    if (!reduceMotion) {
      shakeX.set(withSequence(...SHAKE.map((x) => withTiming(x, {duration: SHAKE_STEP_MS}))));
    }
    glow.set(
      withSequence(
        withTiming(1, {duration: GLOW_IN_MS}),
        withTiming(0, {
          duration: GLOW_OUT_MS,
          easing: Easing.out(Easing.quad),
        }),
      ),
    );
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    startTimer(item.duration, item.id);
    // (each time it's shown again)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudges]);

  // Gone, or replaced: out it goes, then the next one (if any) comes in
  const leaving = !!shown && (!mine || mine.id !== shown.id);
  // Done leaving. The next one, if it's waiting, takes its place in the same
  // pill: remounting the glass for every toast (save, unsave, save...) can
  // leave iOS without the effect drawn, just text
  const cleared = () => {
    dragY.set(0);
    setShown(toastFor(useToastStore.getState(), hostId));
  };
  useEffect(() => {
    if (!leaving) return;
    stopTimer();
    const swap = !!useToastStore.getState().current;
    progress.set(
      withTiming(
        0,
        {
          duration: reduceMotion ? FADE_MS : swap ? SWAP_MS : EXIT_MS,
          easing: Easing.in(Easing.cubic),
        },
        (done) => {
          if (done) scheduleOnRN(cleared);
        },
      ),
    );
    // (when it starts leaving)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  // Swiped away: it's already off screen
  const swiped = () => {
    const item = shownRef.current;
    progress.set(0);
    cleared();
    if (item) Toast.hide(item.id);
  };
  const pause = () => stopTimer();
  const resume = () => {
    const item = shownRef.current;
    if (item && !leaving) startTimer(AFTER_TOUCH_MS, item.id);
  };

  const pan = usePanGesture({
    enabled: !!shown,
    // A small move either way starts a drag; a tap stays a tap
    activeOffsetY: [-6, 6],
    onActivate: () => {
      "worklet";
      scheduleOnRN(pause);
    },
    onUpdate: (e) => {
      "worklet";
      const dy = e.translationY;
      dragY.set(dy < 0 ? dy : dy * DOWN_GIVE);
    },
    onDeactivate: (e) => {
      "worklet";
      const pulled = -dragY.get();
      if (pulled > DISMISS_PULL || e.velocityY < -DISMISS_VELOCITY) {
        // Carry on up at the finger's speed
        const distance = height.get() + top + 24 - pulled;
        const speed = Math.max(-e.velocityY, 700) / 1000;
        const duration = Math.min(320, Math.max(140, distance / speed));
        dragY.set(
          withTiming(-(height.get() + top + 24), {duration, easing: Easing.out(Easing.quad)}, (done) => {
            if (done) scheduleOnRN(swiped);
          }),
        );
      } else {
        dragY.set(withSpring(0, SPRING_BACK));
        scheduleOnRN(resume);
      }
    },
  });

  const glowOpacity = useAnimatedStyle(() => ({opacity: glow.get()}));

  // (a worklet: everything it uses is a shared value or a plain number)
  const style = useAnimatedStyle(() => {
    const offscreen = -(height.get() + top + 24);
    return {
      // Glass mustn't fade (it renders wrong part-transparent): it slides in
      // from off screen, and only fades with Reduce Motion
      opacity: reduceMotion ? progress.get() : 1,
      transform: [
        {
          translateY: (reduceMotion ? 0 : (1 - progress.get()) * offscreen) + dragY.get(),
        },
        {translateX: shakeX.get()},
      ],
    };
  });

  if (!shown) return null;
  const look = TONES[shown.type];
  const glowStyle = {borderColor: look.color};

  return (
    // Only as big as the pill, so it never blocks touches on the screen
    <GestureHandlerRootView
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        alignItems: "center",
      }}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={pan}>
        <Reanimated.View
          style={[{maxWidth: 440, marginHorizontal: 16}, style]}
          onLayout={(e) => height.set(e.nativeEvent.layout.height)}
        >
          {/* Liquid Glass on iOS 26 (frosted blur before it; solid on Android
              or with Reduce Transparency): components/ui/GlassSurface.tsx */}
          <GlassSurface style={{borderRadius: 24}}>
            <Pressable
              onPress={
                shown.onPress
                  ? () => {
                      Toast.hide(shown.id);
                      shown.onPress?.();
                    }
                  : undefined
              }
              accessibilityRole={shown.onPress ? "button" : "text"}
              accessibilityLabel={shown.text2 ? `${shown.text1}. ${shown.text2}` : shown.text1}
              accessibilityHint="Swipe up to dismiss"
              // Optically even: the icon carries its own side space, so its side gets less
              className="flex-row items-center gap-2 pl-3 pr-[18px] py-2.5 active:opacity-70"
            >
              <Ionicons name={look.icon} size={18} color={look.color} />
              {/* Like Apple's: the icon and the lines are one group, centred with even padding */}
              <View className="shrink items-center">
                <Text className={`font-semibold text-sm text-center ${look.title}`} numberOfLines={2}>
                  {shown.text1}
                </Text>
                {shown.text2 ? (
                  <Text className="text-zinc-300 text-xs leading-4 mt-px text-center" numberOfLines={3}>
                    {shown.text2}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </GlassSurface>
          {/* The border lighting up (over the pill's own border) */}
          <Reanimated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, {borderRadius: 24, borderWidth: 1.5}, glowStyle, glowOpacity]}
          />
        </Reanimated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
