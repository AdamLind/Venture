// src/lib/unsplash.ts
// Unsplash photos for the official ideas, through our server function
// (supabase/functions/unsplash: it holds the key, and only admins may use
// it). Picking one tells Unsplash it's used; saving it is a normal update of
// the idea, which only admins may make on official ideas.

import {supabase} from "@/src/supabase";
import type {PhotoCredit, UnsplashCredit} from "@/src/lib/images";

export type UnsplashPhoto = {
  id: string;
  /** ~400 px wide, for the grid */
  thumb: string;
  /** ~1080 px wide, for the preview */
  regular: string;
  /** The link the idea keeps */
  raw: string;
  /** Where using it is reported to Unsplash */
  download: string;
  /** Its page on Unsplash */
  page: string;
  /** Its description, when it has one */
  about: string;
  name: string;
  username: string;
};

export type UnsplashPage = {
  photos: UnsplashPhoto[];
  total: number;
  pages: number;
  /** Unsplash requests left this hour (null: unknown) */
  remaining: number | null;
};

// The last number Unsplash gave for what's left this hour. Answers from
// Unsplash's cache don't say (they don't count), so the picker keeps showing
// this one; older than an hour, the limit has reset and it's unknown again
let lastCount: {remaining: number; at: number} | null = null;
const HOUR_MS = 60 * 60 * 1000;

/** What's left this hour, as Unsplash last said (null: unknown) */
export function knownRemaining(): number | null {
  return lastCount && Date.now() - lastCount.at < HOUR_MS ? lastCount.remaining : null;
}

/** Keeps a new number (a fresh answer's); null leaves the last one */
function noteRemaining(remaining: number | null | undefined) {
  if (typeof remaining === "number") lastCount = {remaining, at: Date.now()};
}

/** A failed call, with what Unsplash said is left this hour (when it said) */
export class UnsplashError extends Error {
  constructor(
    message: string,
    public remaining: number | null,
  ) {
    super(message);
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const {data, error} = await supabase.functions.invoke("unsplash", {body});
  if (error) {
    // The function's own message ("Admins only", "the hourly limit is used up")
    let message = error.message;
    let remaining: number | null = null;
    try {
      const detail = await (error as {context?: Response}).context?.json();
      if (detail?.error) message = detail.error;
      if (typeof detail?.remaining === "number") remaining = detail.remaining;
    } catch {
      // (keep the general message)
    }
    noteRemaining(remaining);
    throw new UnsplashError(message, remaining);
  }
  noteRemaining((data as {remaining?: number | null} | null)?.remaining);
  return data as T;
}

export const searchUnsplash = (query: string, page = 1) => call<UnsplashPage>({action: "search", query, page});

/**
 * Uses a photo from a search: tells Unsplash (one request), and gives its
 * link to show and its credit
 */
export const pickUnsplashPhoto = (photo: UnsplashPhoto) =>
  call<{url: string; credit: UnsplashCredit; remaining: number | null}>({
    action: "use",
    photo: {id: photo.id, raw: photo.raw, download: photo.download, name: photo.name, username: photo.username},
  });

/**
 * Unsplash requests kept for "Use this photo": with this many left, the
 * picker stops searching, so a photo you found can still be used
 */
export const KEEP_FOR_PICKING = 1;

/** Puts the picked photo (Unsplash or Commons) on an official idea (admins) */
export async function savePickedPhoto(ideaId: number, url: string, credit: PhotoCredit) {
  const {data, error} = await supabase
    .from("activities")
    .update({image_urls: [url], image_credits: [credit]})
    .eq("idea_id", ideaId)
    .select("idea_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Couldn't save the photo on this idea.");
}
