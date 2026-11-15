// components/builder/DraggableStop.tsx
// Hold a stop in the builder's timeline, then drag it up or down.
//
// The builder reorders `placed` as the dragged stop crosses its neighbours,
// so the whole timeline (times, travel legs) updates live underneath it.
// This view just keeps the lifted card under your finger: whenever the
// reorder moves its row, onLayout re-anchors the offset to the finger.
//
// Callbacks run on the JS thread (runOnJS), so plain Animated values work.

import React, {useRef, useState} from "react";
import {Animated, type LayoutChangeEvent} from "react-native";
import {GestureDetector, usePanGesture} from "react-native-gesture-handler";

/** Where each stop row sits in the timeline (by idea id). */
export type StopLayouts = Map<number, {y: number; height: number}>;

export default function DraggableStop({
  id,
  enabled,
  layouts,
  onDragStart,
  onDragMove,
  onDragEnd,
  children,
}: {
  id: number;
  enabled: boolean;
  layouts: StopLayouts;
  onDragStart: (id: number) => void;
  /** `centerY`: the lifted card's middle, in timeline coordinates. */
  onDragMove: (id: number, centerY: number) => void;
  onDragEnd: (id: number) => void;
  children: React.ReactNode;
}) {
  const top = useRef(0);
  const height = useRef(0);
  const startTop = useRef(0);
  const translation = useRef(0);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [offset] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(0));

  const onLayout = (e: LayoutChangeEvent) => {
    const {y, height: h} = e.nativeEvent.layout;
    top.current = y;
    height.current = h;
    layouts.set(id, {y, height: h});
    // The reorder moved this row: keep the card where the finger is
    if (draggingRef.current) {
      offset.setValue(startTop.current + translation.current - y);
    }
  };

  const settle = () => {
    Animated.parallel([
      Animated.spring(offset, {toValue: 0, useNativeDriver: true, bounciness: 4}),
      Animated.spring(lift, {toValue: 0, useNativeDriver: true, bounciness: 0}),
    ]).start();
  };

  const pan = usePanGesture({
    enabled,
    runOnJS: true,
    // Hold first, so a normal swipe still scrolls the timeline
    activateAfterLongPress: 250,
    onActivate: () => {
      draggingRef.current = true;
      startTop.current = top.current;
      translation.current = 0;
      setDragging(true);
      Animated.spring(lift, {toValue: 1, useNativeDriver: true, bounciness: 0}).start();
      onDragStart(id);
    },
    onUpdate: (e) => {
      if (!draggingRef.current) return;
      translation.current = e.translationY;
      offset.setValue(startTop.current + e.translationY - top.current);
      onDragMove(id, startTop.current + e.translationY + height.current / 2);
    },
    onFinalize: () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      settle();
      onDragEnd(id);
    },
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={onLayout}
        style={{
          zIndex: dragging ? 10 : 0,
          transform: [
            {translateY: offset},
            {scale: lift.interpolate({inputRange: [0, 1], outputRange: [1, 1.03]})},
          ],
          shadowColor: "#000",
          shadowOpacity: dragging ? 0.5 : 0,
          shadowRadius: 16,
          shadowOffset: {width: 0, height: 10},
          elevation: dragging ? 12 : 0,
        }}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
