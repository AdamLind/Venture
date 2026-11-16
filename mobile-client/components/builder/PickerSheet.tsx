// components/builder/PickerSheet.tsx
// The builder's "Up next" sheet, drawn inside the builder screen rather than
// as a native Modal. A Modal always sits on top of everything, so opening
// an idea's full page meant closing it and reopening it on the way back (a
// visible pause, with taps blocked). As part of the screen, the idea page
// simply slides over it and swiping back finds it still open.
//
// Smooth by construction:
//   - a fixed height (the list scrolls inside), so it never resizes while
//     it slides (a loading spinner turning into a long list did)
//   - while it slides away it keeps showing what it showed when it started
//     closing (the builder stops ranking suggestions once it's closed, and
//     the list emptying mid-slide collapsed it)
//   - the backdrop fades while the sheet slides (like StopLengthSheet)
//
// Dragging it closed, like iOS sheets:
//   - the grabber and header drag it down
//   - so does the list, once it's scrolled to the top: pulling down mid-list
//     scrolls to the top, then the same pull moves the sheet (no lifting
//     your finger). While the sheet is pulled down the list holds still at
//     the top; push back up past where it started and the list scrolls again
//   - let go a quarter of the way down (or flick) and it closes, carrying on
//     at your speed; otherwise it springs back
// All of that runs on the UI thread (Reanimated + gesture handler), so the
// hand-off between scrolling and dragging never waits on JavaScript.
// Android's back button closes it too.

import React, {useEffect, useState} from "react";
import {BackHandler, Pressable, StyleSheet, View, useWindowDimensions} from "react-native";
import Reanimated, {
  Easing,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {scheduleOnRN} from "react-native-worklets";
import {GestureDetector, useNativeGesture, usePanGesture} from "react-native-gesture-handler";

const OPEN_MS = 420;
const CLOSE_MS = 340;
/** Share of the screen's height */
const HEIGHT = 0.75;
/** Dragged this share of the way down (or flicked), it closes */
const CLOSE_SHARE = 0.25;
/** Points per second */
const CLOSE_VELOCITY = 900;
/** Springing back after a short drag */
const SPRING_BACK = {damping: 24, stiffness: 240, overshootClamping: true};
/** A downward move this far starts a drag (taps and small wobbles don't) */
const DRAG_START = 8;
/** "Not yet at the top" (the list pull hasn't reached the sheet) */
const NOT_AT_TOP = -1e9;

export default function PickerSheet({
  visible,
  onClose,
  header,
  contentContainerStyle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Above the list; dragging it (or the grabber) moves the sheet */
  header?: React.ReactNode;
  /** The list's content style (it scrolls inside the sheet) */
  contentContainerStyle?: React.ComponentProps<typeof Reanimated.ScrollView>["contentContainerStyle"];
  /** The list */
  children: React.ReactNode;
}) {
  const {height: windowHeight} = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * HEIGHT);

  // Stays mounted while it animates out
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  // What it shows: the latest while open, frozen while it closes
  const [shown, setShown] = useState<{header: React.ReactNode; body: React.ReactNode}>({
    header,
    body: children,
  });
  if (visible && (shown.header !== header || shown.body !== children)) {
    setShown({header, body: children});
  }

  // 0 closed .. 1 open
  const progress = useSharedValue(0);
  // How far it's been dragged down (0 when not dragging)
  const dragY = useSharedValue(0);
  // The list's scroll position, and the pull's translation when the list
  // reached its top (NOT_AT_TOP until it does)
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

  // Android back closes the sheet, not the builder
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Let go: close (carrying on at your speed) or spring back
  const release = (velocityY: number) => {
    "worklet";
    const pulled = dragY.get();
    if (pulled <= 0) return;
    if (pulled > sheetHeight * CLOSE_SHARE || velocityY > CLOSE_VELOCITY) {
      // Ease-out starts at twice its average speed: match the flick
      const remaining = Math.max(0, sheetHeight - pulled);
      const speed = Math.max(velocityY, 1200) / 1000; // points per ms
      const duration = Math.min(320, Math.max(140, (2 * remaining) / speed));
      dragY.set(
        withTiming(sheetHeight, {duration, easing: Easing.out(Easing.quad)}, (finished) => {
          // Only now tell the builder (its re-render would hold up the slide)
          if (finished) scheduleOnRN(onClose);
        }),
      );
    } else {
      dragY.set(withSpring(0, SPRING_BACK));
    }
  };

  // The grabber + header: a plain downward drag
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

  // The list: its own scrolling, plus a pull that moves the sheet once the
  // list is at the top
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
        // Still scrolling up toward the top
        if (scrollY.get() > 0.5) return;
        topAt.set(e.translationY);
      }
      const pulled = Math.max(0, e.translationY - topAt.get());
      dragY.set(pulled);
      // While the sheet moves, the list holds still at the top
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
    transform: [{translateY: (1 - progress.get()) * sheetHeight + dragY.get()}],
  }));
  // The backdrop lightens as you drag the sheet down
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.get() * (1 - Math.min(1, Math.max(0, dragY.get() / sheetHeight))),
  }));

  if (!mounted) return null;

  return (
    <View
      // Above the rest of the builder (elevation: Android draws by it)
      style={[StyleSheet.absoluteFill, {zIndex: 50, elevation: 50}]}
      // Taps go through while it's closing
      pointerEvents={visible ? "box-none" : "none"}
      accessibilityViewIsModal={visible}
    >
      {/* Backdrop: fades (classes on the plain view inside; NativeWind doesn't
          reliably style Animated views) */}
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable className="flex-1 bg-black/60" onPress={onClose} accessibilityLabel="Close" />
      </Reanimated.View>

      {/* Sheet: slides, at a fixed height. 1px past the sides and bottom: the
          edge line's sides and bottom sit just off screen, so only the top
          line shows, curving around the corners right to the screen's edges */}
      <Reanimated.View
        style={[
          {position: "absolute", left: -1, right: -1, bottom: -1, height: sheetHeight + 1},
          sheetStyle,
        ]}
      >
        {/* The edge line all the way round (a top-only line fades out at the
            rounded corners). No bottom padding: the list runs to the bottom
            of the screen and pads its own end */}
        <View className="flex-1 bg-zinc-950 rounded-t-[32px] border border-zinc-800">
          {/* The drag handle: grabber + header */}
          <GestureDetector gesture={headerPan}>
            <View>
              <View className="items-center pt-3" accessibilityHint="Drag down to close">
                <View className="w-10 h-1.5 rounded-full bg-zinc-700" />
              </View>
              {visible ? header : shown.header}
            </View>
          </GestureDetector>

          {/* The list (pull down at the top to close) */}
          <GestureDetector gesture={listPan}>
            <View className="flex-1">
              <GestureDetector gesture={listScroll}>
                <Reanimated.ScrollView
                  ref={listRef}
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                  // No rubber band at the top: pulling there moves the sheet
                  bounces={false}
                  overScrollMode="never"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={contentContainerStyle}
                >
                  {visible ? children : shown.body}
                </Reanimated.ScrollView>
              </GestureDetector>
            </View>
          </GestureDetector>
        </View>
      </Reanimated.View>
    </View>
  );
}
