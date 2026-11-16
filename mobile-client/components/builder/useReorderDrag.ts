// components/builder/useReorderDrag.ts
// Long-press drag to reorder a list of stops: the builder's timeline, and
// the rest of a live date (components/live/RestEditor.tsx).
//
// How it fits together:
//   - One long-press drag on the list's container (rows move when the list
//     reorders, and iOS cancels a gesture whose view moves, which dropped
//     the stop mid-drag). Wrap the container in <GestureDetector gesture={pan}>.
//   - Each row measures itself with <DraggableStop layouts={layouts}>, so a
//     long press can be matched to the stop under the finger, and a drag can
//     tell when it crosses a neighbour.
//   - While dragging, draw a floating copy of the stop at `drag` (x, y,
//     width), moved by `ghostStyle` on the UI thread; the row stays behind as
//     a faint placeholder. `onMove` reorders as the copy crosses neighbours,
//     so times update live.
//   - A swap happens once the copy's leading edge reaches a neighbour's
//     middle (not its own middle, which meant dragging almost all the way
//     past); edge vs middle also leaves a dead zone after a swap, so it
//     can't flip back.

import {useState, useRef} from "react";
import * as Haptics from "expo-haptics";
import {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";
import {scheduleOnRN} from "react-native-worklets";
import {usePanGesture} from "react-native-gesture-handler";

import type {StopLayouts} from "./DraggableStop";

export type Drag = {id: number; x: number; y: number; width: number; height: number};

export function useReorderDrag({
  order,
  enabled,
  onMove,
  onLift,
  onDrop,
}: {
  /** The stops' ids in their current order, read fresh (a drag outlives renders) */
  order: () => number[];
  enabled: boolean;
  /** Move stop `id` to position `toIndex` */
  onMove: (id: number, toIndex: number) => void;
  /** A stop was lifted (e.g. hold banners still so nothing shoves the list) */
  onLift?: () => void;
  /** The stop settled into place */
  onDrop?: () => void;
}) {
  const [layouts] = useState<StopLayouts>(() => new Map());
  const [drag, setDrag] = useState<Drag | null>(null);
  // The gesture's callbacks read this, not state
  const dragRef = useRef<Drag | null>(null);
  const lastSwapAt = useRef(0);
  const dragY = useSharedValue(0);
  const ghostStyle = useAnimatedStyle(() => ({
    transform: [{translateY: dragY.get()}, {scale: 1.02}],
  }));

  // Long press landed at `y` (container coordinates): lift the stop there, if any
  const handleDragStart = (y: number) => {
    const id = order().find((stopId) => {
      const layout = layouts.get(stopId);
      return layout && y >= layout.y && y <= layout.y + layout.height;
    });
    const layout = id != null ? layouts.get(id) : undefined;
    if (id == null || !layout) return;
    dragRef.current = {id, ...layout};
    onLift?.();
    setDrag(dragRef.current);
    if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleDragMove = (translationY: number) => {
    const current = dragRef.current;
    if (!current) return;
    // Let the rows re-measure after a swap before deciding again
    if (Date.now() - lastSwapAt.current < 100) return;
    const top = current.y + translationY;
    const bottom = top + current.height;
    const ids = order();
    const from = ids.indexOf(current.id);
    if (from === -1) return;
    const middle = (id: number) => {
      const layout = layouts.get(id);
      return layout ? layout.y + layout.height / 2 : null;
    };
    let to = from;
    for (let i = from + 1; i < ids.length; i++) {
      const m = middle(ids[i]);
      if (m === null || bottom < m) break;
      to = i;
    }
    if (to === from) {
      for (let i = from - 1; i >= 0; i--) {
        const m = middle(ids[i]);
        if (m === null || top > m) break;
        to = i;
      }
    }
    if (to !== from) {
      lastSwapAt.current = Date.now();
      onMove(current.id, to);
      // Same kind of haptic as the pickup: a new kind gets set up on first
      // use (on the main thread), which hitched the first swap
      if (process.env.EXPO_OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const clearDrag = () => {
    onDrop?.();
    dragRef.current = null;
    setDrag(null);
  };

  // Settle the copy onto the stop's new row, then drop it
  const handleDragEnd = () => {
    const current = dragRef.current;
    const layout = current ? layouts.get(current.id) : undefined;
    if (!current || !layout) {
      clearDrag();
      return;
    }
    dragY.set(
      withTiming(layout.y - current.y, {duration: 160}, () => {
        "worklet";
        scheduleOnRN(clearDrag);
      }),
    );
  };

  const pan = usePanGesture({
    enabled,
    // Hold first, so a normal swipe still scrolls and taps still work
    activateAfterLongPress: 250,
    onActivate: (e) => {
      "worklet";
      dragY.set(0);
      scheduleOnRN(handleDragStart, e.y);
    },
    onUpdate: (e) => {
      "worklet";
      dragY.set(e.translationY);
      scheduleOnRN(handleDragMove, e.translationY);
    },
    onDeactivate: () => {
      "worklet";
      scheduleOnRN(handleDragEnd);
    },
  });

  return {pan, drag, layouts, ghostStyle};
}
