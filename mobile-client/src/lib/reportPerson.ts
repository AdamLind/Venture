// src/lib/reportPerson.ts
// Report a person (#76): their photo, their name, or how they treat you.
// From their connection sheet, or the people on a date you're both on.
// Reports go to public.user_reports, which is write-only from the app (the
// database checks you know them: a connection, or someone on that date).
// Moderators see them under Moderation › Reported.
//
// Once it's sent you're offered the way to stop seeing them: forget and block
// a connection, or block someone you aren't connected to (their ideas).

import {router} from "expo-router";
import Toast from "@/src/lib/toast";

import {supabase} from "@/src/supabase";
import {MIN_AGE, friendlyError} from "@/src/lib/profile";
import {forgetConnection} from "@/src/lib/connections";
import {showError} from "@/src/lib/notify";
import {type SheetIcon, choose, prompt} from "@/src/lib/sheets";
import {useAccountStore} from "@/src/store/useAccountStore";
import {useBlockStore} from "@/src/store/useBlockStore";

export type PersonReportReason = "PHOTO" | "NAME" | "HARASSMENT" | "SPAM" | "UNDERAGE" | "OTHER";

const REASONS: {value: PersonReportReason; label: string; icon: SheetIcon}[] = [
  {value: "PHOTO", label: "Inappropriate photo", icon: "image-outline"},
  {value: "NAME", label: "Offensive name or username", icon: "text-outline"},
  {value: "HARASSMENT", label: "Harassment or threats", icon: "hand-left-outline"},
  {value: "SPAM", label: "Spam or a fake account", icon: "megaphone-outline"},
  {value: "UNDERAGE", label: `Might be under ${MIN_AGE}`, icon: "people-outline"},
  {value: "OTHER", label: "Something else", icon: "ellipsis-horizontal-circle-outline"},
];
const DETAILS_MAX = 500;

/** For the moderation queue */
export const PERSON_REPORT_REASON_LABEL: Record<PersonReportReason, string> = {
  PHOTO: "Photo",
  NAME: "Name or username",
  HARASSMENT: "Harassment or threats",
  SPAM: "Spam or fake account",
  UNDERAGE: `Might be under ${MIN_AGE}`,
  OTHER: "Something else",
};

export type ReportPlace = {context: "CONNECTION"} | {context: "DATE"; itineraryId: number};

/**
 * What happened: CANCELLED (nothing sent; a sheet underneath can stay open),
 * REPORTED, FORGOT (forgot and blocked them: reload your connections),
 * BLOCKED, or DONE (said why it couldn't be sent).
 */
export type ReportOutcome = "CANCELLED" | "REPORTED" | "FORGOT" | "BLOCKED" | "DONE";

export async function reportPerson(
  person: {id: string; username: string | null},
  place: ReportPlace,
  {connected}: {connected: boolean},
): Promise<ReportOutcome> {
  const name = person.username ? `@${person.username}` : "them";

  if (useAccountStore.getState().suspension) {
    // The reason is in Settings (the suspension notice)
    Toast.show({
      type: "error",
      text1: "You can't report right now",
      text2: "Tap to see why",
      onPress: () => router.push("/settings"),
    });
    return "DONE";
  }

  const reason = await choose({
    title: `Why are you reporting ${name}?`,
    message: "Reports are private. They won't know it was you.",
    options: REASONS.map((r) => ({label: r.label, icon: r.icon, value: r.value})),
  });
  if (!reason) return "CANCELLED";

  let details: string | null = null;
  if (reason === "OTHER") {
    const note = await prompt({
      title: "What happened?",
      message: "A short note helps us look into it.",
      placeholder: "What should we look at?",
      maxLength: DETAILS_MAX,
      multiline: true,
      submitLabel: "Report",
      destructive: true,
    });
    if (note == null) return "CANCELLED";
    details = note.trim().slice(0, DETAILS_MAX) || null;
  }

  // No .select(): reports are write-only, so there's nothing to read back
  const {error} = await supabase.from("user_reports").insert({
    reported_id: person.id,
    reason,
    details,
    context: place.context,
    itinerary_id: place.context === "DATE" ? place.itineraryId : null,
  });
  if (error && error.code !== "23505") {
    showError("Couldn't send your report", new Error(friendlyError(error)));
    return "DONE";
  }
  if (error) {
    Toast.show({type: "success", text1: "Already reported", text2: "We're taking a look"});
    return "REPORTED";
  }

  // Sent. Offer the way to stop seeing them
  const blocked = useBlockStore.getState().ids.has(person.id);
  if (!connected && blocked) {
    Toast.show({type: "success", text1: "Thanks for letting us know", text2: "We'll take a look"});
    return "REPORTED";
  }
  const next = await choose({
    title: "Thanks for letting us know",
    message: connected
      ? `We'll take a look within 24 hours. You can also stop seeing ${name}.`
      : `We'll take a look within 24 hours. You can also hide ${name}'s ideas.`,
    options: [
      connected
        ? {
            label: `Forget and block ${name}`,
            hint: "You leave each other's connections, and their ideas are hidden from you",
            icon: "ban-outline" as SheetIcon,
            destructive: true,
            value: "FORGET" as const,
          }
        : {
            label: `Block ${name}`,
            hint: "Their ideas are hidden from you. They aren't told",
            icon: "ban-outline" as SheetIcon,
            destructive: true,
            value: "BLOCK" as const,
          },
    ],
    cancelLabel: "Done",
  });
  if (!next) return "REPORTED";

  try {
    if (next === "FORGET") {
      await forgetConnection(person.id, true);
      // Their ideas leave Discover now, not on the next load
      const blocks = useBlockStore.getState();
      if (blocks.userId) await blocks.load(blocks.userId);
    } else {
      await useBlockStore.getState().block(person.id);
    }
  } catch (e) {
    showError(next === "FORGET" ? "Couldn't forget them" : "Couldn't block them", e);
    return "REPORTED";
  }
  Toast.show({type: "success", text1: next === "FORGET" ? `Forgot and blocked ${name}` : `Blocked ${name}`});
  return next === "FORGET" ? "FORGOT" : "BLOCKED";
}
