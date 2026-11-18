// src/lib/reportIdea.ts
// The ••• menu on someone else's idea: Not interested, and Report.
// Reports go to public.idea_reports, which is write-only from the app.
// Reporting also hides the idea for you (like "Not interested"), so you
// don't keep seeing what you reported; Settings > Hidden ideas undoes it.

import {ActionSheetIOS, Alert, Platform} from "react-native";
import Toast from "react-native-toast-message";

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {useHiddenStore} from "@/src/store/useHiddenStore";

type Reason = "INAPPROPRIATE" | "SPAM" | "UNSAFE" | "AGE_RATING" | "OTHER";

const REASONS: {value: Reason; label: string}[] = [
  {value: "INAPPROPRIATE", label: "Inappropriate or offensive"},
  {value: "UNSAFE", label: "Unsafe or illegal"},
  {value: "SPAM", label: "Spam or misleading"},
  {value: "AGE_RATING", label: "Wrong age rating"},
  {value: "OTHER", label: "Something else"},
];

async function submit(ideaId: number, reason: Reason, details: string | undefined, onHidden?: () => void) {
  // No .select(): reports are write-only, so there's nothing to read back
  const {error} = await supabase.from("idea_reports").insert({
    idea_id: ideaId,
    reason,
    details: details?.trim() ? details.trim().slice(0, 500) : null,
  });

  if (error && error.code !== "23505") {
    Toast.show({
      type: "error",
      text1: "Couldn't send your report",
      text2: friendlyError(error),
      position: "bottom",
    });
    return;
  }
  // Out of your Discover and plans either way (best effort)
  let hidden = false;
  try {
    await useHiddenStore.getState().hide(ideaId);
    hidden = true;
  } catch (e) {
    console.warn("Couldn't hide the reported idea:", e);
  }
  Toast.show({
    type: "success",
    text1: error ? "You've already reported this" : "Thanks for letting us know",
    text2: hidden
      ? error
        ? "It's hidden for you while we look."
        : "We've hidden it for you, and we'll take a look."
      : error
        ? undefined
        : "We'll take a look.",
    position: "bottom",
  });
  if (hidden) onHidden?.();
}

function chooseReason(ideaId: number, onHidden?: () => void) {
  const onReason = (reason: Reason) => {
    if (reason === "OTHER" && Platform.OS === "ios") {
      Alert.prompt(
        "What's wrong with it?",
        "A short note helps us review it.",
        [
          {text: "Cancel", style: "cancel"},
          {text: "Report", style: "destructive", onPress: (text?: string) => submit(ideaId, reason, text, onHidden)},
        ],
        "plain-text",
      );
      return;
    }
    submit(ideaId, reason, undefined, onHidden);
  };

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Why are you reporting this idea?",
        message: "Reports are private. The person who shared it won't see who reported it.",
        options: [...REASONS.map((r) => r.label), "Cancel"],
        cancelButtonIndex: REASONS.length,
        userInterfaceStyle: "dark",
      },
      (index) => {
        const reason = REASONS[index];
        if (reason) onReason(reason.value);
      },
    );
  } else {
    showAndroidReasons(REASONS, onReason);
  }
}

/** Android alerts fit three buttons, so longer lists continue under "More". */
function showAndroidReasons(
  reasons: typeof REASONS,
  onReason: (reason: Reason) => void,
) {
  const title = "Why are you reporting this idea?";
  const toButton = (r: (typeof REASONS)[number]) => ({
    text: r.label,
    onPress: () => onReason(r.value),
  });
  if (reasons.length <= 2) {
    Alert.alert(title, undefined, [{text: "Cancel", style: "cancel"}, ...reasons.map(toButton)]);
    return;
  }
  Alert.alert(title, undefined, [
    {text: "Cancel", style: "cancel"},
    toButton(reasons[0]),
    {text: "More", onPress: () => showAndroidReasons(reasons.slice(1), onReason)},
  ]);
}

/** Hides the idea from Discover and the builder, with a tap-to-undo toast. */
async function notInterested(ideaId: number, onHidden?: () => void) {
  const {hide, unhide} = useHiddenStore.getState();
  try {
    await hide(ideaId);
  } catch (e) {
    Toast.show({
      type: "error",
      text1: "Couldn't hide it",
      text2: e instanceof Error ? e.message : undefined,
      position: "bottom",
    });
    return;
  }
  onHidden?.();
  Toast.show({
    type: "success",
    text1: "You won't see this idea again",
    text2: "Tap to undo",
    position: "bottom",
    onPress: () => {
      Toast.hide();
      unhide(ideaId).catch((e) =>
        Toast.show({
          type: "error",
          text1: "Couldn't undo",
          text2: e instanceof Error ? e.message : undefined,
          position: "bottom",
        }),
      );
    },
  });
}

/**
 * The ••• menu on someone else's idea.
 * `onHidden` runs once it's hidden for you: after "Not interested", or after
 * reporting it (e.g. leave the page).
 * `onReview` (staff with their tools on) adds "Review as staff" first.
 */
export function showIdeaMenu(
  ideaId: number,
  {onHidden, onReview}: {onHidden?: () => void; onReview?: () => void} = {},
) {
  const items: {label: string; destructive?: boolean; run: () => void}[] = [
    ...(onReview ? [{label: "Review as staff", run: onReview}] : []),
    {label: "Not interested", run: () => notInterested(ideaId, onHidden)},
    {label: "Report idea", destructive: true, run: () => chooseReason(ideaId, onHidden)},
  ];

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...items.map((i) => i.label), "Cancel"],
        destructiveButtonIndex: items.findIndex((i) => i.destructive),
        cancelButtonIndex: items.length,
        userInterfaceStyle: "dark",
      },
      (index) => items[index]?.run(),
    );
  } else {
    Alert.alert("Idea options", undefined, [
      {text: "Cancel", style: "cancel"},
      ...items.map((i) => ({
        text: i.label,
        style: i.destructive ? ("destructive" as const) : undefined,
        onPress: i.run,
      })),
    ]);
  }
}
