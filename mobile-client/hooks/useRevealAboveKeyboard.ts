// hooks/useRevealAboveKeyboard.ts
// Scrolls a focused input up so it sits just above the keyboard, for inputs
// low on a scrolling page (the comment boxes on a date, a place's "How to get
// there"). Works when the keyboard is already up and you move to another
// input, and with a button riding on the keyboard (`clearance`: its height).
//
// The scroll view needs room to scroll that far: a KeyboardAvoidingView
// around it, or `automaticallyAdjustKeyboardInsets` on it.
//
//   const {scrollRef, onScroll, reveal} = useRevealAboveKeyboard();
//   <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} ...>
//   <TextInput ref={inputRef} onFocus={() => reveal(inputRef.current)} ... />
//
// A multi-line input that grows as you type: reveal it again from
// onContentSizeChange while it's focused.

import React, {useCallback, useRef} from "react";
import {Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView} from "react-native";

/** Space between the input and the keyboard (or what rides on it) */
const GAP = 16;

/** Anything on screen that can say where it is (a TextInput) */
export type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

type ScrollRef = React.RefObject<React.ComponentRef<typeof ScrollView> | null>;

/** `existing`: the screen's own scroll view ref, if it has one */
export function useRevealAboveKeyboard(existing?: ScrollRef) {
  const own = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollRef = existing ?? own;
  const offset = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  /** `clearance`: the height of anything riding on top of the keyboard (a Next button) */
  const reveal = useCallback(
    (input: Measurable | null, clearance = 0) => {
      if (!input) return;
      const scrollAbove = (keyboardTop: number) =>
        input.measureInWindow((_x, y, _w, h) => {
          const overlap = y + h + GAP - (keyboardTop - clearance);
          if (overlap > 0) scrollRef.current?.scrollTo({y: offset.current + overlap, animated: true});
        });

      // Keyboard already up (moving between inputs): now; otherwise once it's
      // shown (and the screen has made room for it)
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
    },
    [scrollRef],
  );

  return {scrollRef, onScroll, reveal};
}
