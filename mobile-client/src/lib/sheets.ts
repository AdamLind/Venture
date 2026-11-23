// src/lib/sheets.ts
// Our own pop-ups (#86), in place of the system's Alert, Alert.prompt and
// ActionSheetIOS: they match the app, and work the same on iOS and Android.
//
//   if (await confirm({title: "Delete this idea?", confirmLabel: "Delete", destructive: true})) ...
//   const reason = await choose({title: "Why?", options: [{label: "Spam", value: "SPAM"}]});
//   const note = await prompt({title: "What's wrong with it?", submitLabel: "Report"});
//
// Cancelling (Cancel, a swipe down, a tap outside, Android's back) resolves
// false / null. An answer resolves once its sheet has slid away, so the next
// sheet, screen or modal can open straight after; requests made meanwhile
// wait their turn.
//
// Shown by components/sheets/SheetHost.tsx. The root layout has one, and so
// does every screen or modal that opens over the app (iOS presents a pop-up
// from the top-most one only): the newest host shows them.

import type React from "react";
import type {Ionicons} from "@expo/vector-icons";
import {create} from "zustand";

export type SheetIcon = React.ComponentProps<typeof Ionicons>["name"];

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** The action ("Delete", "Sign out") */
  confirmLabel: string;
  /** "Cancel" unless it says otherwise ("Keep going") */
  cancelLabel?: string;
  /** Ends, removes or loses something: a red button and a warning buzz */
  destructive?: boolean;
  icon?: SheetIcon;
};

export type ChoiceOption<T> = {
  label: string;
  value: T;
  icon?: SheetIcon;
  /** A line under the label */
  hint?: string;
  destructive?: boolean;
};

export type ChooseOptions<T> = {
  title?: string;
  message?: string;
  options: ChoiceOption<T>[];
  cancelLabel?: string;
};

export type PromptOptions = {
  title: string;
  message?: string;
  placeholder?: string;
  /** Prefilled */
  initial?: string;
  /** Shows what's left */
  maxLength?: number;
  submitLabel: string;
  destructive?: boolean;
  /** Can be sent empty (default: it needs some text) */
  optional?: boolean;
  /** A few lines (default: one) */
  multiline?: boolean;
};

export type SheetRequest = (
  | ({kind: "confirm"} & ConfirmOptions)
  | ({kind: "choose"} & ChooseOptions<unknown>)
  | ({kind: "prompt"} & PromptOptions)
) & {id: number; resolve: (answer: unknown) => void};

type SheetState = {
  /** The one showing first, then the ones waiting */
  queue: SheetRequest[];
  /** Mounted hosts, oldest first: the last one shows the sheets */
  hosts: number[];
  /** The host showing the first one (it finishes it, even if a newer host mounts) */
  showingHost: number | null;
};

export const useSheetStore = create<SheetState>(() => ({queue: [], hosts: [], showingHost: null}));

let nextId = 1;

function ask<T>(request: Omit<SheetRequest, "id" | "resolve">): Promise<T> {
  return new Promise<T>((resolve) => {
    const full = {...request, id: nextId++, resolve: resolve as (answer: unknown) => void} as SheetRequest;
    useSheetStore.setState((s) => ({queue: [...s.queue, full]}));
  });
}

/** Yes or no. Resolves true for the action, false for cancel. */
export const confirm = (options: ConfirmOptions) => ask<boolean>({kind: "confirm", ...options});

/** One of a few options. Resolves its value, or null for cancel. */
export const choose = <T>(options: ChooseOptions<T>) =>
  ask<T | null>({kind: "choose", ...(options as ChooseOptions<unknown>)});

/** A short text. Resolves it (trimmed), or null for cancel. */
export const prompt = (options: PromptOptions) => ask<string | null>({kind: "prompt", ...options});

/** The host calls this once the sheet has slid away */
export function settleSheet(id: number, answer: unknown) {
  const {queue} = useSheetStore.getState();
  const request = queue.find((r) => r.id === id);
  if (!request) return;
  useSheetStore.setState({queue: queue.filter((r) => r.id !== id), showingHost: null});
  request.resolve(answer);
}

/** A new host's id */
export const newSheetHostId = () => nextId++;

/**
 * A host mounts: it shows sheets until a newer one mounts. Unmounting while
 * showing one hands it back, so the next host shows it again.
 */
export function registerSheetHost(id: number): () => void {
  useSheetStore.setState((s) => ({hosts: [...s.hosts, id]}));
  return () =>
    useSheetStore.setState((s) => ({
      hosts: s.hosts.filter((h) => h !== id),
      showingHost: s.showingHost === id ? null : s.showingHost,
    }));
}

/** The host starts showing the first request */
export const claimSheet = (hostId: number) => useSheetStore.setState({showingHost: hostId});

/**
 * Waits for a modal that's closing (a page sheet slides away in about this
 * long): iOS can't show a pop-up while another one is still leaving.
 */
export const afterSheetCloses = () => new Promise<void>((resolve) => setTimeout(resolve, 450));

/** What an answer means when the sheet is just dismissed */
export const cancelAnswer = (request: SheetRequest) => (request.kind === "confirm" ? false : null);
