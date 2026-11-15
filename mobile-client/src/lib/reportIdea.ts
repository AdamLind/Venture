// src/lib/reportIdea.ts
// Reporting someone else's idea (the ••• button on an idea's page).
// Reports go to public.idea_reports, which is write-only from the app.

import {ActionSheetIOS, Alert, Platform} from "react-native";
import Toast from "react-native-toast-message";

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";

type Reason = "INAPPROPRIATE" | "SPAM" | "UNSAFE" | "AGE_RATING" | "OTHER";

const REASONS: {value: Reason; label: string}[] = [
  {value: "INAPPROPRIATE", label: "Inappropriate or offensive"},
  {value: "UNSAFE", label: "Unsafe or illegal"},
  {value: "SPAM", label: "Spam or misleading"},
  {value: "AGE_RATING", label: "Wrong age rating"},
  {value: "OTHER", label: "Something else"},
];

async function submit(ideaId: number, reason: Reason, details?: string) {
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
  Toast.show({
    type: "success",
    text1: error ? "You've already reported this" : "Thanks for letting us know",
    text2: error ? undefined : "We'll take a look.",
    position: "bottom",
  });
}

function chooseReason(ideaId: number) {
  const onReason = (reason: Reason) => {
    if (reason === "OTHER" && Platform.OS === "ios") {
      Alert.prompt(
        "What's wrong with it?",
        "A short note helps us review it.",
        [
          {text: "Cancel", style: "cancel"},
          {text: "Report", style: "destructive", onPress: (text?: string) => submit(ideaId, reason, text)},
        ],
        "plain-text",
      );
      return;
    }
    submit(ideaId, reason);
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

/** The ••• menu on someone else's idea. */
export function showIdeaMenu(ideaId: number) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Report idea", "Cancel"],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
        userInterfaceStyle: "dark",
      },
      (index) => {
        if (index === 0) chooseReason(ideaId);
      },
    );
  } else {
    Alert.alert("Idea options", undefined, [
      {text: "Cancel", style: "cancel"},
      {text: "Report idea", style: "destructive", onPress: () => chooseReason(ideaId)},
    ]);
  }
}
