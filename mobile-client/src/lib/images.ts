// src/lib/images.ts
// Ask for photos at the size they're shown, not their original size.
//
// The seeded ideas point at Unsplash with no size, which serves the original
// (often 4000-6000 px wide, several MB): a 64-point thumbnail was downloading
// and decoding a whole camera photo, which made scrolling stutter. Unsplash
// resizes on its side when given `w`, so we request the shown width times the
// screen's density, rounded up to a few steps so the cache can reuse them.
//
// Photos uploaded through the create form are already resized to 800 px wide
// on upload, so they pass through unchanged.

import {PixelRatio} from "react-native";

// Profile photos (app/settings/edit-profile.tsx) are uploaded twice: 1080 px
// for seeing them full screen, and a 256 px thumbnail next to it
// ("<name>_thumb.jpg") for avatars in lists. Photos from before the
// thumbnails existed don't have one (Avatar falls back to the photo).
export const AVATAR_FULL_PX = 1080;
export const AVATAR_THUMB_PX = 256;
const AVATAR_MARKER = "/storage/v1/object/public/avatars/";

/** An uploaded profile photo's thumbnail (null if it isn't one of ours) */
export function avatarThumb(url: string | null | undefined): string | null {
  if (!url || !url.includes(AVATAR_MARKER) || !url.endsWith(".jpg") || url.endsWith("_thumb.jpg")) return null;
  return url.replace(/\.jpg$/, "_thumb.jpg");
}

/** Pixel widths we request (more steps would mean fewer cache hits). */
const STEPS = [200, 400, 800, 1200, 1600];

function pixelWidth(displayWidth: number): number {
  const px = displayWidth * PixelRatio.get();
  return STEPS.find((step) => step >= px) ?? STEPS[STEPS.length - 1];
}

/**
 * `url`, resized for something `displayWidth` points wide (when the host
 * supports it). Unknown hosts pass through unchanged.
 */
export function sizedImage(url: string, displayWidth: number): string;
export function sizedImage(url: string | null | undefined, displayWidth: number): string | null;
export function sizedImage(url: string | null | undefined, displayWidth: number): string | null {
  if (!url) return null;
  if (!url.startsWith("https://images.unsplash.com/")) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("w", String(pixelWidth(displayWidth)));
    u.searchParams.set("q", "70");
    u.searchParams.set("auto", "format");
    u.searchParams.set("fit", "crop");
    return u.toString();
  } catch {
    return url;
  }
}

/** Common display widths, in points. */
export const IMAGE_SIZE = {
  thumb: 64, // list rows, stop cards
  card: 240, // horizontal pick cards, small heroes
  full: 430, // full-width photos (Discover cards, idea page, date covers)
};
