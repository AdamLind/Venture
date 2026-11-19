// hooks/useRevealAboveKeyboard.ts
// Scrolls a focused input up so it sits just above the keyboard, for inputs
// low on a long scrolling page (the comment boxes on a date). Give the scroll
// view `automaticallyAdjustKeyboardInsets` too, so there's room to scroll.
//
//   const {scrollRef, onScroll, reveal} = useRevealAboveKeyboard();
//   <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} ...>
//   <TextInput onFocus={() => reveal(inputRef.current)} ... />

import React, {useCallback, useRef} from "react";
import {Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView} from "react-native";

/** Space between the input and the keyboard */
const GAP = 16;

/** Anything on screen that can say where it is (a TextInput) */
export type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

export function useRevealAboveKeyboard() {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  const reveal = useCallback((input: Measurable | null) => {
    if (!input) return;
    const scrollAbove = (keyboardTop: number) =>
      input.measureInWindow((_x, y, _w, h) => {
        const overlap = y + h + GAP - keyboardTop;
        if (overlap > 0) scrollRef.current?.scrollTo({y: offset.current + overlap, animated: true});
      });

    // Keyboard already up (moving between inputs): now; otherwise once it's shown
    const metrics = Keyboard.metrics();
    if (metrics) {
      scrollAbove(metrics.screenY);
      return;
    }
    const sub = Keyboard.addListener("keyboardDidShow", (e) => {
      sub.remove();
      scrollAbove(e.endCoordinates.screenY);
    });
    // Never shown (a hardware keyboard): stop listening
    setTimeout(() => sub.remove(), 1500);
  }, []);

  return {scrollRef, onScroll, reveal};
}
