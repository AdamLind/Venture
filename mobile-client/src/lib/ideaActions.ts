// src/lib/ideaActions.ts
// The ••• menu for one of your own ideas (Profile > My Ideas).
//
//   Every idea ........ Edit (saving sends it to review, or keeps it private)
//   Published ......... Unpublish (back to private)
//   Private ........... Submit for review, Delete
//   In review ......... Withdraw from review, Delete
//   Needs changes /
//   Not approved ...... Withdraw (make private), Delete
//
// Published ideas can't be deleted outright: deleting would silently pull
// them out of other people's dates and bucket lists. Unpublish first.

import {router} from "expo-router";
import Toast from "@/src/lib/toast";

import {IDEA_STATUS} from "@/src/lib/ideas";
import {type SheetIcon, choose, confirm} from "@/src/lib/sheets";
import {useMyIdeasStore} from "@/src/store/useMyIdeasStore";
import {useSavedStore} from "@/src/store/useSavedStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import type {IdeaSummary} from "@/types/ideas";

interface Action {
  label: string;
  icon: SheetIcon;
  destructive?: boolean;
  run: () => void;
}

const fail = (title: string) => (e: unknown) =>
  Toast.show({
    type: "error",
    text1: title,
    text2: e instanceof Error ? e.message : undefined,
  });

const done = (text1: string) =>
  Toast.show({type: "success", text1});

/** Confirm, then unpublish (back to private). `onDone` runs after it's done. */
export async function confirmUnpublishIdea(ideaId: number, onDone?: () => void) {
  const ok = await confirm({
    title: "Unpublish this idea?",
    message:
      "It leaves Discover and goes back to private. Anyone who saved it or added it to a date won't see it anymore. Publishing again means another review.",
    confirmLabel: "Unpublish",
    destructive: true,
    icon: "eye-off-outline",
  });
  if (!ok) return;
  return useMyIdeasStore
    .getState()
    .setVisibility(ideaId, "PRIVATE")
    .then(() => {
      useSavedStore.getState().reload();
      done("Unpublished");
      onDone?.();
    })
    .catch(fail("Couldn't unpublish it"));
}

/** Confirm, then delete (not for published ideas). `onDone` runs after. */
export async function confirmDeleteIdea(ideaId: number, onDone?: () => void) {
  const ok = await confirm({
    title: "Delete this idea?",
    message: "This can't be undone. If it's a stop in any of your dates, it's removed from them too.",
    confirmLabel: "Delete",
    destructive: true,
    icon: "trash-outline",
  });
  if (!ok) return;
  return useMyIdeasStore
    .getState()
    .remove(ideaId)
    .then(() => {
      // It may have been a stop in your dates or in your bucket list
      useItineraryStore.getState().reload();
      useSavedStore.getState().reload();
      done("Idea deleted");
      onDone?.();
    })
    .catch(fail("Couldn't delete it"));
}

export async function showIdeaActions(idea: IdeaSummary) {
  const {setVisibility} = useMyIdeasStore.getState();
  const actions: Action[] = [
    {
      label: "Edit",
      icon: "create-outline",
      run: () =>
        router.push({pathname: "/create", params: {ideaId: String(idea.idea_id)}}),
    },
  ];

  if (idea.visibility === "PUBLISHED") {
    actions.push({
      label: "Unpublish",
      icon: "eye-off-outline",
      destructive: true,
      run: () => confirmUnpublishIdea(idea.idea_id),
    });
  }

  if (idea.visibility === "PRIVATE") {
    actions.push({
      label: "Submit for review",
      icon: "paper-plane-outline",
      run: () =>
        setVisibility(idea.idea_id, "PENDING_REVIEW")
          .then(() => done("Submitted for review"))
          .catch(fail("Couldn't submit it")),
    });
  }

  if (
    idea.visibility === "PENDING_REVIEW" ||
    idea.visibility === "NEEDS_REVISION" ||
    idea.visibility === "REJECTED"
  ) {
    actions.push({
      label: "Withdraw from review",
      icon: "arrow-undo-outline",
      run: () =>
        setVisibility(idea.idea_id, "PRIVATE")
          .then(() => done("Moved back to private"))
          .catch(fail("Couldn't withdraw it")),
    });
  }

  if (idea.visibility !== "PUBLISHED") {
    actions.push({
      label: "Delete",
      icon: "trash-outline",
      destructive: true,
      run: () => confirmDeleteIdea(idea.idea_id),
    });
  }

  if (actions.length === 0) return;
  const picked = await choose({
    title: idea.title,
    message: IDEA_STATUS[idea.visibility].detail,
    options: actions.map((a, i) => ({label: a.label, icon: a.icon, destructive: a.destructive, value: i})),
  });
  if (picked != null) actions[picked].run();
}
