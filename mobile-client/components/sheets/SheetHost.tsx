// components/sheets/SheetHost.tsx
// Shows the app's own pop-ups (#86: src/lib/sheets.ts): confirm, choose and
// prompt, as bottom sheets in the app's colors.
//
// Mount one at the root, and one in each screen or modal that opens over the
// app (iOS presents a pop-up from the top-most one only); the newest shows
// them. It slides up with a short spring (a fade with Reduce Motion), buzzes
// lightly (a warning for destructive ones), and closes with Cancel, a tap
// outside, a swipe down (the way components/connections/ConnectionSheet.tsx
// does) or Android's back. Answers settle once it has slid away; a waiting
// request opens straight after, in the same window.

import React, {useEffect, useRef, useState} from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {scheduleOnRN} from "react-native-worklets";
import {GestureDetector, GestureHandlerRootView, usePanGesture} from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import {Ionicons} from "@expo/vector-icons";

import {
  type SheetRequest,
  cancelAnswer,
  claimSheet,
  newSheetHostId,
  registerSheetHost,
  settleSheet,
  useSheetStore,
} from "@/src/lib/sheets";

const OPEN_SPRING = {damping: 26, stiffness: 300, mass: 0.9};
const CLOSE_MS = 220;
const FADE_MS = 160;
/** Dragged this share of its height down (or flicked), it closes */
const CLOSE_SHARE = 0.25;
const CLOSE_VELOCITY = 900;
const SPRING_BACK = {damping: 24, stiffness: 240, overshootClamping: true};
const DRAG_START = 8;
/** Under the screen's edge, so the spring's overshoot never shows a gap */
const UNDER_EDGE = 40;
/** Waits this long for a next request before closing the window */
const LINGER_MS = 80;

export default function SheetHost() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [hostId] = useState(newSheetHostId);
  useEffect(() => registerSheetHost(hostId), [hostId]);

  // The first request, if this host is the one to show it
  const request = useSheetStore((s) => {
    const first = s.queue[0];
    if (!first) return null;
    if (s.showingHost != null) return s.showingHost === hostId ? first : null;
    return s.hosts[s.hosts.length - 1] === hostId ? first : null;
  });

  // What's showing (it stays while it slides away), and the window
  const [shown, setShown] = useState<SheetRequest | null>(null);
  const [windowOn, setWindowOn] = useState(false);
  const closing = useRef(false);
  const shownRef = useRef<SheetRequest | null>(null);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const sheetHeight = useSharedValue(400);
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);

  // A request to show: it's the one showing now
  if (request && !shown) {
    setShown(request);
    setWindowOn(true);
  }

  // ...and it slides up
  const shownId = shown?.id ?? null;
  useEffect(() => {
    const current = shownRef.current ?? shown;
    if (shownId == null || !current) return;
    claimSheet(hostId);
    closing.current = false;
    dragY.set(0);
    progress.set(0);
    progress.set(reduceMotion ? withTiming(1, {duration: FADE_MS}) : withSpring(1, OPEN_SPRING));
    if (process.env.EXPO_OS === "ios") {
      const destructive = current.kind !== "choose" && current.destructive;
      if (destructive) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // VoiceOver starts at the title
    const t = setTimeout(() => {
      if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, "focus");
    }, 350);
    return () => clearTimeout(t);
    // (once per request, by its id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownId]);

  // Nothing left to show: close the window (after a moment, in case one follows)
  useEffect(() => {
    if (shown || !windowOn || request) return;
    const t = setTimeout(() => setWindowOn(false), LINGER_MS);
    return () => clearTimeout(t);
  }, [shown, windowOn, request]);

  // It has slid away: settle the answer
  const finish = (answer: unknown) => {
    const current = shownRef.current;
    if (!current) return;
    setShown(null);
    settleSheet(current.id, answer);
  };
  const finishCancel = () => {
    const current = shownRef.current;
    if (current) finish(cancelAnswer(current));
  };

  const answer = (value: unknown) => {
    if (closing.current) return;
    closing.current = true;
    progress.set(
      withTiming(0, {duration: reduceMotion ? FADE_MS : CLOSE_MS, easing: Easing.in(Easing.cubic)}, (done) => {
        if (done) scheduleOnRN(finish, value);
      }),
    );
  };
  const cancel = () => {
    if (shown) answer(cancelAnswer(shown));
  };

  // Let go of a drag: close at your speed, or spring back
  const release = (velocityY: number) => {
    "worklet";
    const pulled = dragY.get();
    if (pulled <= 0) return;
    const height = sheetHeight.get();
    if (pulled > height * CLOSE_SHARE || velocityY > CLOSE_VELOCITY) {
      const remaining = Math.max(0, height - pulled);
      const speed = Math.max(velocityY, 1200) / 1000;
      const duration = Math.min(260, Math.max(110, (2 * remaining) / speed));
      dragY.set(
        withTiming(height + UNDER_EDGE, {duration, easing: Easing.out(Easing.quad)}, (done) => {
          if (done) scheduleOnRN(finishCancel);
        }),
      );
    } else {
      dragY.set(withSpring(0, SPRING_BACK));
    }
  };
  const pan = usePanGesture({
    enabled: !!shown,
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

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? progress.get() : 1,
    transform: [
      {translateY: (reduceMotion ? 0 : (1 - progress.get()) * (sheetHeight.get() + UNDER_EDGE)) + dragY.get()},
    ],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      Math.min(1, progress.get()) * (1 - Math.min(1, Math.max(0, dragY.get() / Math.max(1, sheetHeight.get())))),
  }));

  if (!windowOn) return null;

  const grabber = (
    <View className="items-center pt-3 pb-3">
      <View className="w-10 h-1.5 rounded-full bg-zinc-700" />
    </View>
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={cancel}>
      <GestureHandlerRootView style={{flex: 1}}>
        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
          style={{flex: 1, justifyContent: "flex-end"}}
        >
          <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable className="flex-1 bg-black/60" onPress={cancel} accessibilityLabel="Close" />
          </Reanimated.View>

          {shown && (
            <Reanimated.View
              key={shown.id}
              style={[{marginHorizontal: -1, marginBottom: -UNDER_EDGE}, sheetStyle]}
              onLayout={(e) => sheetHeight.set(e.nativeEvent.layout.height - UNDER_EDGE)}
              accessibilityViewIsModal
            >
              <View
                className="bg-zinc-950 rounded-t-[32px] border border-zinc-800 px-5"
                style={{paddingBottom: Math.max(insets.bottom, 16) + UNDER_EDGE}}
              >
                {shown.kind === "prompt" ? (
                  // A text field: only the top drags (so selecting text doesn't)
                  <PromptBody
                    request={shown}
                    titleRef={titleRef}
                    onAnswer={answer}
                    header={(children) => (
                      <GestureDetector gesture={pan}>
                        <View accessibilityHint="Drag down to close">
                          {grabber}
                          {children}
                        </View>
                      </GestureDetector>
                    )}
                  />
                ) : (
                  <GestureDetector gesture={pan}>
                    <View>
                      {grabber}
                      {shown.kind === "confirm" ? (
                        <ConfirmBody request={shown} titleRef={titleRef} onAnswer={answer} />
                      ) : (
                        <ChooseBody request={shown} titleRef={titleRef} onAnswer={answer} />
                      )}
                    </View>
                  </GestureDetector>
                )}
              </View>
            </Reanimated.View>
          )}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── The pieces ────────────────────────────────────────────────────────────────

type BodyProps<K extends SheetRequest["kind"]> = {
  request: Extract<SheetRequest, {kind: K}>;
  titleRef: React.RefObject<React.ComponentRef<typeof Text> | null>;
  onAnswer: (value: unknown) => void;
};

/** A full-width button. Every kind has a border, so switching never remounts it */
function SheetButton({
  label,
  kind,
  disabled,
  onPress,
}: {
  label: string;
  kind: "primary" | "destructive" | "secondary";
  disabled?: boolean;
  onPress: () => void;
}) {
  const look = {
    primary: {box: "bg-white border-white", text: "text-black"},
    destructive: {box: "bg-red-500 border-red-500", text: "text-white"},
    secondary: {box: "bg-zinc-900 border-zinc-800", text: "text-white"},
  }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{disabled: !!disabled}}
      className={`min-h-14 py-3.5 px-4 rounded-2xl border items-center justify-center active:opacity-80 ${look.box}`}
      style={{opacity: disabled ? 0.4 : 1}}
    >
      <Text className={`font-bold text-base text-center ${look.text}`}>{label}</Text>
    </Pressable>
  );
}

function Heading({
  title,
  message,
  titleRef,
  big,
}: {
  title?: string;
  message?: string;
  titleRef: React.RefObject<React.ComponentRef<typeof Text> | null>;
  big?: boolean;
}) {
  if (!title && !message) return null;
  return (
    <View className="items-center gap-1.5 px-2 pb-5">
      {title ? (
        <Text
          ref={titleRef}
          accessibilityRole="header"
          className={`text-white text-center ${big ? "font-extrabold text-xl" : "font-bold text-[17px]"}`}
        >
          {title}
        </Text>
      ) : null}
      {message ? <Text className="text-zinc-400 text-[15px] leading-[21px] text-center">{message}</Text> : null}
    </View>
  );
}

function ConfirmBody({request, titleRef, onAnswer}: BodyProps<"confirm">) {
  const tint = request.destructive ? "#f87171" : "#ffffff";
  return (
    <>
      {request.icon && (
        <View className="items-center pb-3">
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{backgroundColor: request.destructive ? "#ef44441f" : "#ffffff14"}}
          >
            <Ionicons name={request.icon} size={26} color={tint} />
          </View>
        </View>
      )}
      <Heading title={request.title} message={request.message} titleRef={titleRef} big />
      <View className="gap-2.5">
        <SheetButton
          label={request.confirmLabel}
          kind={request.destructive ? "destructive" : "primary"}
          onPress={() => onAnswer(true)}
        />
        <SheetButton label={request.cancelLabel ?? "Cancel"} kind="secondary" onPress={() => onAnswer(false)} />
      </View>
    </>
  );
}

function ChooseBody({request, titleRef, onAnswer}: BodyProps<"choose">) {
  return (
    <>
      <Heading title={request.title} message={request.message} titleRef={titleRef} />
      <View className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden mb-2.5">
        {request.options.map((option, i) => (
          <Pressable
            key={`${option.label}-${i}`}
            onPress={() => onAnswer(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.hint ? `${option.label}. ${option.hint}` : option.label}
            className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-zinc-800 ${i > 0 ? "border-t border-zinc-800" : ""}`}
          >
            {option.icon && (
              <Ionicons name={option.icon} size={19} color={option.destructive ? "#f87171" : "#d4d4d8"} />
            )}
            <View className="flex-1">
              <Text className={`font-semibold text-base ${option.destructive ? "text-red-400" : "text-white"}`}>
                {option.label}
              </Text>
              {option.hint ? <Text className="text-zinc-400 text-[13px] mt-0.5">{option.hint}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
      <SheetButton label={request.cancelLabel ?? "Cancel"} kind="secondary" onPress={() => onAnswer(null)} />
    </>
  );
}

function PromptBody({
  request,
  titleRef,
  onAnswer,
  header,
}: BodyProps<"prompt"> & {header: (children: React.ReactNode) => React.ReactNode}) {
  const [text, setText] = useState(request.initial ?? "");
  const canSend = !!request.optional || text.trim().length > 0;
  const send = () => canSend && onAnswer(text.trim());
  return (
    <>
      {header(<Heading title={request.title} message={request.message} titleRef={titleRef} big />)}
      <View className="mb-4">
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          multiline={request.multiline}
          maxLength={request.maxLength}
          placeholder={request.placeholder}
          placeholderTextColor="#71717a"
          returnKeyType={request.multiline ? "default" : "send"}
          onSubmitEditing={request.multiline ? undefined : send}
          submitBehavior={request.multiline ? "newline" : "submit"}
          textAlignVertical="top"
          accessibilityLabel={request.title}
          className="px-4 py-3.5 text-white bg-zinc-900 border border-zinc-800 rounded-2xl"
          // Font size only (a line height pushes text off centre on iOS)
          style={{fontSize: 16, minHeight: request.multiline ? 104 : undefined}}
        />
        {request.maxLength ? (
          <Text className="text-zinc-500 text-xs text-right mt-1.5 mr-1">{request.maxLength - text.length} left</Text>
        ) : null}
      </View>
      <View className="gap-2.5">
        <SheetButton
          label={request.submitLabel}
          kind={request.destructive ? "destructive" : "primary"}
          disabled={!canSend}
          onPress={send}
        />
        <SheetButton label="Cancel" kind="secondary" onPress={() => onAnswer(null)} />
      </View>
    </>
  );
}
