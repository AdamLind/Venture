// src/lib/ideaActions.ts
// The ••• menu for one of your own ideas (Profile > My Ideas).
//
//   Published ......... Unpublish (back to private)
//   Private ........... Submit for review, Delete
//   In review ......... Withdraw from review, Delete
//   Needs changes /
//   Not approved ...... Delete
//
// Published ideas can't be deleted outright: deleting would silently pull
// them out of other people's dates and bucket lists. Unpublish first.

import {ActionSheetIOS, Alert, Platform} from "react-native";
import Toast from "react-native-toast-message";

import {IDEA_STATUS} from "@/src/lib/ideas";
import {useMyIdeasStore} from "@/src/store/useMyIdeasStore";
import {useSavedStore} from "@/src/store/useSavedStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import type {IdeaSummary} from "@/types/ideas";

interface Action {
  label: string;
  destructive?: boolean;
  run: () => void;
}

const fail = (title: string) => (e: unknown) =>
  Toast.show({
    type: "error",
    text1: title,
    text2: e instanceof Error ? e.message : undefined,
    position: "bottom",
  });

const done = (text1: string) =>
  Toast.show({type: "success", text1, position: "bottom"});

function confirm(
  title: string,
  message: string,
  action: string,
  onConfirm: () => void,
) {
  Alert.alert(title, message, [
    {text: "Cancel", style: "cancel"},
    {text: action, style: "destructive", onPress: onConfirm},
  ]);
}

export function showIdeaActions(idea: IdeaSummary) {
  const {setVisibility, remove} = useMyIdeasStore.getState();
  const actions: Action[] = [];

  if (idea.visibility === "PUBLISHED") {
    actions.push({
      label: "Unpublish",
      destructive: true,
      run: () =>
        confirm(
          "Unpublish this idea?",
          "It leaves Discover and goes back to private. Anyone who saved it or added it to a date won't see it anymore. Publishing again means another review.",
          "Unpublish",
          () =>
            setVisibility(idea.idea_id, "PRIVATE")
              .then(() => {
                useSavedStore.getState().reload();
                done("Unpublished");
              })
              .catch(fail("Couldn't unpublish it")),
        ),
    });
  }

  if (idea.visibility === "PRIVATE") {
    actions.push({
      label: "Submit for review",
      run: () =>
        setVisibility(idea.idea_id, "PENDING_REVIEW")
          .then(() => done("Submitted for review"))
          .catch(fail("Couldn't submit it")),
    });
  }

  if (idea.visibility === "PENDING_REVIEW") {
    actions.push({
      label: "Withdraw from review",
      run: () =>
        setVisibility(idea.idea_id, "PRIVATE")
          .then(() => done("Moved back to private"))
          .catch(fail("Couldn't withdraw it")),
    });
  }

  if (idea.visibility !== "PUBLISHED") {
    actions.push({
      label: "Delete",
      destructive: true,
      run: () =>
        confirm(
          "Delete this idea?",
          "This can't be undone. If it's a stop in any of your dates, it's removed from them too.",
          "Delete",
          () =>
            remove(idea.idea_id)
              .then(() => {
                // It may have been a stop in your dates or in your bucket list
                useItineraryStore.getState().reload();
                useSavedStore.getState().reload();
                done("Idea deleted");
              })
              .catch(fail("Couldn't delete it")),
        ),
    });
  }

  if (actions.length === 0) return;
  const detail = IDEA_STATUS[idea.visibility].detail;

  if (Platform.OS === "ios") {
    const destructiveButtonIndex = actions
      .map((a, i) => (a.destructive ? i : -1))
      .filter((i) => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: idea.title,
        message: detail,
        options: [...actions.map((a) => a.label), "Cancel"],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex,
        userInterfaceStyle: "dark",
      },
      (index) => actions[index]?.run(),
    );
  } else {
    // Android alerts fit two actions plus Cancel, which is the most we have
    Alert.alert(idea.title, detail, [
      {text: "Cancel", style: "cancel"},
      ...actions.map((a) => ({
        text: a.label,
        style: a.destructive ? ("destructive" as const) : ("default" as const),
        onPress: a.run,
      })),
    ]);
  }
}
