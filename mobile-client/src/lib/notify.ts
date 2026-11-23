// src/lib/notify.ts
// Toasts for what doesn't need an answer (#86): what happened, what went
// wrong, a heads-up. Decisions get a sheet instead (src/lib/sheets.ts).
// Each stays long enough to read it (src/lib/toast.ts).

import Toast from "@/src/lib/toast";

/** The error's message, or a fallback */
export const errorText = (e: unknown, fallback = "Please try again.") =>
  e instanceof Error && e.message ? e.message : typeof e === "string" && e ? e : fallback;

/** Something went wrong ("Couldn't save that"), and why */
export function showError(title: string, e?: unknown, fallback?: string) {
  Toast.show({type: "error", text1: title, text2: errorText(e, fallback)});
}

/** It's done ("Invite sent") */
export function showDone(title: string, message?: string, onPress?: () => void) {
  Toast.show({type: "success", text1: title, text2: message, onPress});
}

/** A heads-up ("Add a stop first"); `onPress` for "Tap to see why" */
export function showInfo(title: string, message?: string, onPress?: () => void) {
  Toast.show({type: "info", text1: title, text2: message, onPress});
}
