// components/builder/PickerSheet.tsx
// The builder's "Up next" sheet, drawn inside the builder screen rather than
// as a native Modal. A Modal always sits on top of everything, so opening
// an idea's full page meant closing it and reopening it on the way back (a
// visible pause, with taps blocked). As part of the screen, the idea page
// simply slides over it and swiping back finds it still open.
//
// Smooth by construction:
//   - its content never resizes it (the list scrolls inside; a loading
//     spinner turning into a long list used to): only you do, below
//   - while it slides away it keeps showing what it showed when it started
//     closing (the builder stops ranking suggestions once it's closed, and
//     the list emptying mid-slide collapsed it), at the height it had
//   - the backdrop fades while the sheet slides (like StopLengthSheet)
//
// Two heights and closed, like iOS sheets: it opens at 75% of the screen and
// goes all the way up (just under the status bar) for more room.
//   - the grabber and header drag it up and down
//   - so does the list: at 75%, pushing the list up raises the sheet first,
//     then the list scrolls; once it's scrolled to the top, pulling down
//     lowers the sheet (no lifting your finger). While the sheet moves the
//     list holds still
//   - let go and it settles at the nearer height, or the way you flicked it.
//     Pulled below 75%, a quarter of the way down (or a flick) closes it;
//     otherwise it goes back up. Each carries on at your finger's speed and
//     eases to a stop (no spring starting from still)
//   - `expanded` raises or lowers it from outside (the builder raises it when
//     you tap the search box); `onExpandedChange` hears where you left it
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
  withTiming,
} from "react-native-reanimated";
import {scheduleOnRN} from "react-native-worklets";
import {GestureDetector, useNativeGesture, usePanGesture} from "react-native-gesture-handler";
import {useSafeAreaInsets} from "react-native-safe-area-context";

const OPEN_MS = 420;
const CLOSE_MS = 340;
/** Share of the screen's height, at the usual height */
const HEIGHT = 0.75;
/** All the way up: this far below the status bar */
const EXPANDED_GAP = 8;
const EXPAND_MS = 280;
/** Dragged this share of the usual height below it (or flicked), it closes */
const CLOSE_SHARE = 0.25;
/** Points per second: a flick closes it, or moves it to the other height */
const CLOSE_VELOCITY = 900;
const FLICK_VELOCITY = 600;
/** Settling after a drag: at least this fast (points per second), and
 *  between these lengths (ms) */
const SETTLE_MIN_SPEED = 1200;
const SETTLE_MIN_MS = 140;
const SETTLE_MAX_MS = 320;
/** A move this far either way starts a drag (taps and small wobbles don't) */
const DRAG_START = 8;

export default function PickerSheet({
  visible,
  onClose,
  header,
  contentContainerStyle,
  children,
  expanded = false,
  onExpandedChange,
}: {
  visible: boolean;
  onClose: () => void;
  /** All the way up, to just under the status bar */
  expanded?: boolean;
  /** You dragged it all the way up (true) or back to the usual height */
  onExpandedChange?: (expanded: boolean) => void;
  /** Above the list; dragging it (or the grabber) moves the sheet */
  header?: React.ReactNode;
  /** The list's content style (it scrolls inside the sheet) */
  contentContainerStyle?: React.ComponentProps<typeof Reanimated.ScrollView>["contentContainerStyle"];
  /** The list */
  children: React.ReactNode;
}) {
  const {height: windowHeight} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const baseHeight = Math.round(windowHeight * HEIGHT);
  const fullHeight = Math.max(baseHeight, windowHeight - insets.top - EXPANDED_GAP);
  const span = fullHeight - baseHeight;

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
  // 0 at the usual height .. 1 all the way up
  const grow = useSharedValue(expanded ? 1 : 0);
  // Where it's headed (1 up, 0 usual), so `expanded` catching up with a
  // drag doesn't restart the move
  const growTarget = useSharedValue(expanded ? 1 : 0);
  // How far it's been dragged below the usual height (0 when not)
  const dragY = useSharedValue(0);
  // The list's scroll position
  const scrollY = useSharedValue(0);
  // A drag in progress: the last translation seen, where the list is held
  // while the sheet moves (-1: not holding), and whether the sheet moved
  const headerLast = useSharedValue(0);
  const listLast = useSharedValue(0);
  const heldAt = useSharedValue(-1);
  const sheetMoved = useSharedValue(false);
  const listRef = useAnimatedRef<Reanimated.ScrollView>();

  // Raised or lowered from outside (the search box); while it closes it
  // keeps its height, like its content
  useEffect(() => {
    if (!visible) return;
    const target = expanded ? 1 : 0;
    if (growTarget.get() === target) return;
    growTarget.set(target);
    grow.set(withTiming(target, {duration: EXPAND_MS, easing: Easing.out(Easing.cubic)}));
  }, [expanded, visible, grow, growTarget]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      dragY.set(0);
      scrollY.set(0);
      // Opens where `expanded` says, whatever height it closed at
      growTarget.set(expanded ? 1 : 0);
      grow.set(expanded ? 1 : 0);
      progress.set(withTiming(1, {duration: OPEN_MS, easing: Easing.out(Easing.cubic)}));
    } else {
      progress.set(
        withTiming(0, {duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic)}, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
    // (only on open and close: `expanded` moves it on its own, above)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // How much of the sheet shows: its height, less how far it's pulled down
  const visibleHeight = () => {
    "worklet";
    return baseHeight + grow.get() * span - dragY.get();
  };
  // Shows `height` of the sheet: taller than usual grows it (up to all the
  // way), shorter pulls it down
  const showHeight = (height: number) => {
    "worklet";
    if (height >= baseHeight) {
      grow.set(span > 0 ? Math.min(1, (height - baseHeight) / span) : 0);
      dragY.set(0);
    } else {
      grow.set(0);
      dragY.set(baseHeight - height);
    }
  };
  // Moves it by one frame of a drag (`delta` > 0 is down)
  const moveBy = (delta: number) => {
    "worklet";
    showHeight(visibleHeight() - delta);
    sheetMoved.set(true);
  };

  // Settling after a drag carries on at your finger's speed and eases to a
  // stop: an ease-out starts at twice its average speed, so the length that
  // starts at your speed is 2 × distance / speed. `towards` is your speed in
  // the direction it's going (points per second; moving the other way, or
  // barely moving, it goes at SETTLE_MIN_SPEED)
  const settle = (distance: number, towards: number) => {
    "worklet";
    const speed = Math.max(towards, SETTLE_MIN_SPEED) / 1000; // points per ms
    const duration = Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, (2 * Math.abs(distance)) / speed));
    return {duration, easing: Easing.out(Easing.quad)};
  };

  // Let go: close, spring back, or settle at a height, all at your speed
  const release = (velocityY: number) => {
    "worklet";
    if (!sheetMoved.get()) return;
    sheetMoved.set(false);
    const pulled = dragY.get();
    if (pulled > 0) {
      if (pulled > baseHeight * CLOSE_SHARE || velocityY > CLOSE_VELOCITY) {
        dragY.set(
          withTiming(baseHeight, settle(baseHeight - pulled, velocityY), (finished) => {
            // Only now tell the builder (its re-render would hold up the slide)
            if (finished) scheduleOnRN(onClose);
          }),
        );
      } else {
        // Back up to the usual height (up is negative velocity)
        dragY.set(withTiming(0, settle(pulled, -velocityY)));
      }
      if (growTarget.get() !== 0) {
        growTarget.set(0);
        if (onExpandedChange) scheduleOnRN(onExpandedChange, false);
      }
      return;
    }
    const target =
      velocityY < -FLICK_VELOCITY ? 1 : velocityY > FLICK_VELOCITY ? 0 : grow.get() > 0.5 ? 1 : 0;
    // Going up is negative velocity
    const distance = Math.abs(target - grow.get()) * span;
    grow.set(withTiming(target, settle(distance, target === 1 ? -velocityY : velocityY)));
    if (growTarget.get() !== target) {
      growTarget.set(target);
      if (onExpandedChange) scheduleOnRN(onExpandedChange, target === 1);
    }
  };

  // The grabber + header: drags the sheet up and down
  const headerPan = usePanGesture({
    enabled: visible,
    activeOffsetY: [-DRAG_START, DRAG_START],
    onActivate: (e) => {
      "worklet";
      headerLast.set(e.translationY);
    },
    onUpdate: (e) => {
      "worklet";
      const delta = e.translationY - headerLast.get();
      headerLast.set(e.translationY);
      moveBy(delta);
    },
    onDeactivate: (e) => {
      "worklet";
      release(e.velocityY);
    },
  });

  // The list: its own scrolling, plus the sheet taking the move when it's
  // not all the way up (pushing up) or the list is at its top (pulling down)
  const listScroll = useNativeGesture({});
  const listPan = usePanGesture({
    enabled: visible,
    activeOffsetY: [-DRAG_START, DRAG_START],
    simultaneousWith: listScroll,
    onActivate: (e) => {
      "worklet";
      listLast.set(e.translationY);
      heldAt.set(-1);
    },
    onUpdate: (e) => {
      "worklet";
      const delta = e.translationY - listLast.get();
      listLast.set(e.translationY);
      const sheetTakes =
        (delta < 0 && (grow.get() < 1 || dragY.get() > 0)) ||
        (delta > 0 && scrollY.get() <= 0.5);
      if (!sheetTakes) {
        // The list scrolls (from wherever it was held)
        heldAt.set(-1);
        return;
      }
      if (heldAt.get() < 0) heldAt.set(Math.max(0, scrollY.get()));
      moveBy(delta);
      // While the sheet moves, the list holds still
      scrollTo(listRef, 0, heldAt.get(), false);
    },
    onDeactivate: (e) => {
      "worklet";
      heldAt.set(-1);
      release(e.velocityY);
    },
  });

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const sheetStyle = useAnimatedStyle(() => {
    const sheetHeight = baseHeight + grow.get() * span;
    return {
      height: sheetHeight + 1,
      transform: [{translateY: (1 - progress.get()) * sheetHeight + dragY.get()}],
    };
  });
  // The backdrop lightens as you drag the sheet down
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.get() * (1 - Math.min(1, Math.max(0, dragY.get() / baseHeight))),
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

      {/* Sheet: slides, at its height. 1px past the sides and bottom: the
          edge line's sides and bottom sit just off screen, so only the top
          line shows, curving around the corners right to the screen's edges */}
      <Reanimated.View
        style={[{position: "absolute", left: -1, right: -1, bottom: -1}, sheetStyle]}
      >
        {/* The edge line all the way round (a top-only line fades out at the
            rounded corners). No bottom padding: the list runs to the bottom
            of the screen and pads its own end */}
        <View className="flex-1 bg-zinc-950 rounded-t-[32px] border border-zinc-800">
          {/* The drag handle: grabber + header */}
          <GestureDetector gesture={headerPan}>
            <View>
              {/* Screen readers: the grabber raises and lowers it */}
              <Pressable
                onPress={onExpandedChange ? () => onExpandedChange(!expanded) : undefined}
                disabled={!onExpandedChange}
                accessibilityRole="button"
                accessibilityLabel={expanded ? "Make the list shorter" : "Make the list taller"}
                accessibilityHint="Or drag up and down. Drag down to close"
                className="items-center pt-3 pb-1"
                hitSlop={{top: 8, bottom: 4, left: 40, right: 40}}
              >
                <View className="w-10 h-1.5 rounded-full bg-zinc-700" />
              </Pressable>
              {visible ? header : shown.header}
            </View>
          </GestureDetector>

          {/* The list (pushes the sheet up; pull down at the top to lower or close it) */}
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
                  // Typing a search: the list ends above the keyboard, a
                  // scroll puts the keyboard away, and one tap adds a result
                  automaticallyAdjustKeyboardInsets
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
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
