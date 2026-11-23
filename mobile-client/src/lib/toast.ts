// src/lib/toast.ts
// The app's toasts (#86): small pills that drop from the top, like iOS's own
// ("Copied", "Added to Library"). Shown by components/sheets/ToastHost.tsx.
//
//   Toast.show({type: "success", text1: "Invite sent", text2: "They'll see it in their Dates."})
//
// One at a time: a new one takes the place of the one showing, but the same
// one again (tapping a sixth idea twice) just shakes it and starts its time
// over, instead of leaving and coming back. Each stays
// long enough to read (longer for more words); a swipe up dismisses it, and
// it waits while your finger is on it. `onPress` makes it tappable ("Tap to
// undo"). src/lib/notify.ts has the usual shapes (an error, a result, a
// heads-up).
//
// Like the sheets (src/lib/sheets.ts), the root layout has a host and so
// does every screen or modal that opens over the app. A toast stays in the
// host that showed it; if that one closes first, the next host takes over.

import {create} from "zustand";

export type ToastType = "success" | "error" | "info";

export type ToastOptions = {
  type?: ToastType;
  /** What happened */
  text1: string;
  /** More, when it helps */
  text2?: string;
  onPress?: () => void;
  /** How long it stays (default: long enough to read it) */
  visibilityTime?: number;
};

export type ToastItem = Required<Pick<ToastOptions, "type" | "text1">> &
  Omit<ToastOptions, "type" | "text1" | "visibilityTime"> & {
    id: number;
    /** How long it stays, in ms */
    duration: number;
    /** Shown again while it was up: each one shakes it */
    nudges: number;
  };

export type ToastState = {
  current: ToastItem | null;
  /** The host showing it (null: the newest host picks it up) */
  owner: number | null;
  hosts: number[];
};

export const useToastStore = create<ToastState>(() => ({current: null, owner: null, hosts: []}));

let nextId = 1;

/**
 * How long it stays: a moment to notice it, then time to read the words
 * (about 25 characters a second). "Saved" is up 2 seconds, two short lines
 * about 3, a long error 5. One with something to tap ("Tap to undo") gets
 * at least 3, to reach it. (Sliding in and out adds about a second you see.)
 */
export function readingTime(text1: string, text2?: string, tappable = false) {
  const chars = text1.length + (text2?.length ?? 0);
  const read = Math.min(8000, Math.max(2000, 1000 + chars * 40));
  return tappable ? Math.max(3000, read) : read;
}

const Toast = {
  show(options: ToastOptions) {
    const {visibilityTime, type = "info", ...rest} = options;
    // The same one is up: draw attention to it instead. Not for ones you
    // tap ("Tap to undo"): two of those are about two different things
    const {current} = useToastStore.getState();
    if (
      current &&
      !current.onPress &&
      !rest.onPress &&
      current.type === type &&
      current.text1 === rest.text1 &&
      (current.text2 ?? "") === (rest.text2 ?? "")
    ) {
      useToastStore.setState({current: {...current, nudges: current.nudges + 1}});
      return;
    }
    useToastStore.setState({
      current: {
        ...rest,
        type,
        id: nextId++,
        duration: visibilityTime ?? readingTime(options.text1, options.text2, !!options.onPress),
        nudges: 0,
      },
      owner: null,
    });
  },
  /** Hides the one showing (or only `id`, if it's still that one) */
  hide(id?: number) {
    const {current} = useToastStore.getState();
    if (!current || (id != null && current.id !== id)) return;
    useToastStore.setState({current: null, owner: null});
  },
};

export default Toast;

export const newToastHostId = () => nextId++;

/** A host mounts; unmounting while showing a toast hands it to the next one */
export function registerToastHost(id: number): () => void {
  useToastStore.setState((s) => ({hosts: [...s.hosts, id]}));
  return () =>
    useToastStore.setState((s) => ({
      hosts: s.hosts.filter((h) => h !== id),
      owner: s.owner === id ? null : s.owner,
    }));
}

/** The host starts showing the current toast */
export const claimToast = (hostId: number) => useToastStore.setState({owner: hostId});
