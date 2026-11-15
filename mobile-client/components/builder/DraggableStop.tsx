// components/builder/DraggableStop.tsx
// A stop row in the builder's timeline that can be reordered by dragging.
//
// How dragging fits together (see the builder's "Reordering" section):
//   - The drag gesture lives on the timeline container, not on the rows.
//     Reordering physically moves the rows' native views, and iOS cancels a
//     gesture whose view is moved, which dropped the stop mid-drag.
//   - Each row measures itself here, so a long press can be matched to the
//     stop under the finger, and the builder can tell when the dragged stop
//     crosses a neighbour.
//   - While you drag, the builder draws a floating copy that follows your
//     finger on the UI thread; this row stays behind as a faint placeholder.

import React from "react";
import {View, type LayoutChangeEvent} from "react-native";

/** Where each stop row sits in the timeline container (by idea id). */
export type StopLayouts = Map<number, {x: number; y: number; width: number; height: number}>;

export default function DraggableStop({
  id,
  dragging,
  layouts,
  children,
}: {
  id: number;
  /** This stop is the one being dragged: show the placeholder */
  dragging: boolean;
  layouts: StopLayouts;
  children: React.ReactNode;
}) {
  const onLayout = (e: LayoutChangeEvent) => {
    const {x, y, width, height} = e.nativeEvent.layout;
    layouts.set(id, {x, y, width, height});
  };

  return (
    <View onLayout={onLayout} style={{opacity: dragging ? 0.25 : 1}}>
      {children}
    </View>
  );
}
