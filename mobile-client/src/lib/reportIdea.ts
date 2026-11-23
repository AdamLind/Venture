// src/lib/reportIdea.ts
// The ••• menu on someone else's idea: Not interested, Block the creator,
// and Report.
// Reports go to public.idea_reports, which is write-only from the app.
// Reporting also hides the idea for you (like "Not interested"), so you
// don't keep seeing what you reported; Settings > Hidden ideas undoes it.

import {router} from "expo-router";
import Toast from "@/src/lib/toast";

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {type SheetIcon, choose, confirm, prompt} from "@/src/lib/sheets";
import {useHiddenStore} from "@/src/store/useHiddenStore";
import {useBlockStore} from "@/src/store/useBlockStore";
import {useAccountStore} from "@/src/store/useAccountStore";

type Reason = "INAPPROPRIATE" | "SPAM" | "UNSAFE" | "AGE_RATING" | "OTHER";

const REASONS: {value: Reason; label: string; icon: SheetIcon}[] = [
  {value: "INAPPROPRIATE", label: "Inappropriate or offensive", icon: "hand-left-outline"},
  {value: "UNSAFE", label: "Unsafe or illegal", icon: "warning-outline"},
  {value: "SPAM", label: "Spam or misleading", icon: "megaphone-outline"},
  {value: "AGE_RATING", label: "Wrong age rating", icon: "people-outline"},
  {value: "OTHER", label: "Something else", icon: "ellipsis-horizontal-circle-outline"},
];
const DETAILS_MAX = 500;

async function submit(ideaId: number, reason: Reason, details: string | undefined, onHidden?: () => void) {
  // No .select(): reports are write-only, so there's nothing to read back
  const {error} = await supabase.from("idea_reports").insert({
    idea_id: ideaId,
    reason,
    details: details?.trim() ? details.trim().slice(0, DETAILS_MAX) : null,
  });

  if (error && error.code !== "23505") {
    Toast.show({
      type: "error",
      text1: "Couldn't send your report",
      text2: friendlyError(error),
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
    text1: error ? "Already reported" : "Thanks for letting us know",
    text2: hidden ? "Hidden while we take a look" : error ? undefined : "We'll take a look",
  });
  if (hidden) onHidden?.();
}

async function chooseReason(ideaId: number, onHidden?: () => void) {
  if (useAccountStore.getState().suspension) {
    // The reason is in Settings (the suspension notice)
    Toast.show({
      type: "error",
      text1: "You can't report right now",
      text2: "Tap to see why",
      onPress: () => router.push("/settings"),
    });
    return;
  }
  const reason = await choose({
    title: "Why are you reporting this idea?",
    message: "Reports are private. The person who shared it won't see who reported it.",
    options: REASONS.map((r) => ({label: r.label, icon: r.icon, value: r.value})),
  });
  if (!reason) return;
  let details: string | undefined;
  if (reason === "OTHER") {
    const note = await prompt({
      title: "What's wrong with it?",
      message: "A short note helps us review it.",
      placeholder: "What should we look at?",
      maxLength: DETAILS_MAX,
      multiline: true,
      submitLabel: "Report",
      destructive: true,
    });
    if (note == null) return;
    details = note;
  }
  await submit(ideaId, reason, details, onHidden);
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
    });
    return;
  }
  onHidden?.();
  Toast.show({
    type: "success",
    text1: "Idea hidden",
    text2: "Tap to undo",
    onPress: () => {
      Toast.hide();
      unhide(ideaId).catch((e) =>
        Toast.show({
          type: "error",
          text1: "Couldn't undo",
          text2: e instanceof Error ? e.message : undefined,
        }),
      );
    },
  });
}

/** Hides every idea from a creator (#76). Nobody is told. */
async function confirmBlock(creator: {id: string; username: string | null}, onHidden?: () => void) {
  const name = creator.username ? `@${creator.username}` : "this creator";
  const ok = await confirm({
    title: `Block ${name}?`,
    message:
      "You won't see their ideas in Discover or when you plan a date. They won't be told. You can unblock them in Settings › Hidden ideas.",
    confirmLabel: "Block",
    destructive: true,
    icon: "ban-outline",
  });
  if (!ok) return;
  try {
    await useBlockStore.getState().block(creator.id);
  } catch (e) {
    Toast.show({
      type: "error",
      text1: "Couldn't block them",
      text2: e instanceof Error ? e.message : undefined,
    });
    return;
  }
  Toast.show({type: "success", text1: `Blocked ${name}`});
  onHidden?.();
}

/**
 * The ••• menu on someone else's idea.
 * `onHidden` runs once it's hidden for you: after "Not interested", or after
 * reporting it (e.g. leave the page).
 * `onReview` (staff with their tools on) adds "Review as staff" first.
 * `creator` adds "Block @username".
 */
export async function showIdeaMenu(
  ideaId: number,
  {
    onHidden,
    onReview,
    creator,
  }: {
    onHidden?: () => void;
    onReview?: () => void;
    creator?: {id: string; username: string | null} | null;
  } = {},
) {
  const items: {label: string; icon: SheetIcon; destructive?: boolean; run: () => void}[] = [
    ...(onReview ? [{label: "Review as staff", icon: "shield-checkmark-outline" as SheetIcon, run: onReview}] : []),
    {label: "Not interested", icon: "eye-off-outline", run: () => notInterested(ideaId, onHidden)},
    ...(creator
      ? [
          {
            label: creator.username ? `Block @${creator.username}` : "Block creator",
            icon: "ban-outline" as SheetIcon,
            run: () => confirmBlock(creator, onHidden),
          },
        ]
      : []),
    {label: "Report idea", icon: "flag-outline", destructive: true, run: () => chooseReason(ideaId, onHidden)},
  ];
  const picked = await choose({
    options: items.map((item, i) => ({label: item.label, icon: item.icon, destructive: item.destructive, value: i})),
  });
  if (picked != null) items[picked].run();
}
