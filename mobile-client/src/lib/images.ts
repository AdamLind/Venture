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
/** Wikimedia Commons thumbnails ("…/thumb/…/1280px-Name.jpg") and its standard widths */
const COMMONS_THUMB = /\/(\d+)px-(?=[^/]*$)/;
const COMMONS_WIDTHS = [330, 500, 960, 1280];
const isCommonsThumb = (url: string) => /^https:\/\/(upload|thumb)\.wikimedia\.org\/.*\/thumb\//.test(url);

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
  const commons = isCommonsThumb(url) ? url.match(COMMONS_THUMB) : null;
  if (commons) {
    // Wikimedia makes thumbnails only at its standard widths: the smallest
    // that's big enough, never bigger than the one the idea kept
    const kept = Number(commons[1]);
    const px = displayWidth * PixelRatio.get();
    const width = Math.min(kept, COMMONS_WIDTHS.find((w) => w >= px) ?? kept);
    return url.replace(COMMONS_THUMB, `/${width}px-`);
  }
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

// ─── Credit for a photo (activities.image_credits) ───────────────────────────
// Official ideas can use photos from Unsplash or Wikimedia Commons, picked by
// admins in the app (components/ideas/PhotoPickerSheet.tsx).
// - Unsplash's API rules: show them from Unsplash (we do: sizedImage keeps its
//   `ixid`), and credit the photographer and Unsplash, linking to both with
//   these utm tags.
// - Commons photos are freely licensed: credit the photographer (linking to the
//   photo's page) and the licence (linking to it).

/**
 * The app's name in Unsplash's referral links: a placeholder until the app's
 * name is settled. Change it then, along with the app's name on Unsplash
 * (unsplash.com/oauth/applications)
 */
export const UNSPLASH_UTM = "utm_source=date_ideas_app&utm_medium=referral";

export interface UnsplashCredit {
  source: "unsplash";
  photo_id: string;
  /** The photographer's name, as on Unsplash */
  name: string;
  /** Their Unsplash username (their profile: unsplash.com/@username) */
  username: string;
}

export interface CommonsCredit {
  source: "wikimedia";
  /** "File:Rock Canyon Park (42821926692).jpg" (its page on Commons) */
  file: string;
  /** The photographer, as Commons gives it (null: not given) */
  name: string | null;
  /** "CC BY-SA 2.0", "Public domain" */
  license: string;
  license_url: string | null;
}

export type PhotoCredit = UnsplashCredit | CommonsCredit;

/** The credit for an idea's first photo (the one it shows), if it has one */
export function photoCredit(credits: unknown): PhotoCredit | null {
  const first = Array.isArray(credits) ? credits[0] : null;
  if (!first || typeof first !== "object") return null;
  const c = first as Record<string, unknown>;
  const has = (key: string) => typeof c[key] === "string" && (c[key] as string).trim() !== "";
  if (c.source === "unsplash" && has("name") && has("username")) return first as UnsplashCredit;
  if (c.source === "wikimedia" && has("file") && has("license")) return first as CommonsCredit;
  return null;
}

/** A Commons photo's page */
export const commonsPage = (credit: CommonsCredit) =>
  `https://commons.wikimedia.org/wiki/${encodeURIComponent(credit.file.replace(/ /g, "_"))}`;

export const unsplashProfile = (credit: UnsplashCredit) =>
  `https://unsplash.com/@${encodeURIComponent(credit.username)}?${UNSPLASH_UTM}`;
export const UNSPLASH_HOME = `https://unsplash.com/?${UNSPLASH_UTM}`;

/** Common display widths, in points. */
export const IMAGE_SIZE = {
  thumb: 64, // list rows, stop cards
  card: 240, // horizontal pick cards, small heroes
  full: 430, // full-width photos (Discover cards, idea page, date covers)
};
