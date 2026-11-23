// src/lib/captures.ts
// Live photos (#38): taken in the app during a date, never from the camera
// roll. Each is saved twice in the private `captures` bucket, at
// {user_id}/{itinerary_id}/{time}.jpg (1080 px) and {time}_thumb.jpg
// (360 px, for grids), with a row in public.captures. The database only
// takes them while the date is live (ACTIVE), from people on it, and stamps
// the time itself. Everyone on the date, and your person on dates you made,
// can see them; the app shows them through short-lived signed links.

import * as ImageManipulator from "expo-image-manipulator";

import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";

const BUCKET = "captures";
export const PHOTO_PX = 1080;
export const PHOTO_THUMB_PX = 360;
/** Signed links last a day (expo-image caches by path, not by link) */
const LINK_SECONDS = 24 * 60 * 60;

export type CaptureKind = "STOP" | "END";

export interface Capture {
  capture_id: number;
  user_id: string;
  itinerary_id: number;
  /** The stop's idea (STOP photos; null once the idea's gone) */
  activity_id: number | null;
  kind: CaptureKind;
  storage_path: string;
  thumb_path: string | null;
  caption: string | null;
  created_at: string;
  /** Signed links (null if they couldn't be made) */
  url: string | null;
  thumbUrl: string | null;
}

const COLUMNS = "capture_id, user_id, itinerary_id, activity_id, kind, storage_path, thumb_path, caption, created_at";

/** Signed links for these paths (missing ones come back null) */
async function signedLinks(paths: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (!paths.length) return links;
  const {data, error} = await supabase.storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS);
  if (error) {
    console.warn("Couldn't sign photo links:", error.message);
    return links;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
  }
  return links;
}

async function withLinks(rows: Omit<Capture, "url" | "thumbUrl">[]): Promise<Capture[]> {
  const links = await signedLinks(
    rows.flatMap((r) => (r.thumb_path ? [r.storage_path, r.thumb_path] : [r.storage_path])),
  );
  return rows.map((r) => ({
    ...r,
    url: links.get(r.storage_path) ?? null,
    thumbUrl: (r.thumb_path && links.get(r.thumb_path)) ?? links.get(r.storage_path) ?? null,
  }));
}

/** The photos on these dates, oldest first */
export async function fetchCaptures(itineraryIds: number[]): Promise<Capture[]> {
  if (!itineraryIds.length) return [];
  const {data, error} = await supabase
    .from("captures")
    .select(COLUMNS)
    .in("itinerary_id", itineraryIds)
    .order("created_at", {ascending: true})
    .limit(2000);
  if (error) throw new Error(friendlyError(error));
  return withLinks((data ?? []) as Omit<Capture, "url" | "thumbUrl">[]);
}

/**
 * Saves a photo from the camera to a live date: resized, uploaded with its
 * thumbnail, then recorded. Throws a readable Error (the files are removed
 * again if the record is refused).
 */
export async function savePhoto(
  localUri: string,
  {userId, itineraryId, ideaId, kind}: {userId: string; itineraryId: number; ideaId: number | null; kind: CaptureKind},
): Promise<Capture> {
  const [photo, thumb] = await Promise.all([
    ImageManipulator.manipulateAsync(localUri, [{resize: {width: PHOTO_PX}}], {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
    }),
    ImageManipulator.manipulateAsync(localUri, [{resize: {width: PHOTO_THUMB_PX}}], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    }),
  ]);

  const stamp = Date.now();
  const path = `${userId}/${itineraryId}/${stamp}.jpg`;
  const thumbPath = `${userId}/${itineraryId}/${stamp}_thumb.jpg`;
  const storage = supabase.storage.from(BUCKET);
  const upload = async (uri: string, to: string) => {
    const body = await (await fetch(uri)).arrayBuffer();
    const {error} = await storage.upload(to, body, {contentType: "image/jpeg"});
    if (error) throw new Error(friendlyError(error));
  };

  await upload(photo.uri, path);
  try {
    await upload(thumb.uri, thumbPath);
  } catch (e) {
    await storage.remove([path]);
    throw e;
  }

  const {data, error} = await supabase
    .from("captures")
    .insert({
      itinerary_id: itineraryId,
      activity_id: kind === "STOP" ? ideaId : null,
      kind,
      storage_path: path,
      thumb_path: thumbPath,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    await storage.remove([path, thumbPath]);
    // The date ended (or you were taken off it) while the photo uploaded
    throw new Error(
      error.code === "42501" ? "This date isn't live anymore, so photos can't be added." : friendlyError(error),
    );
  }
  const [saved] = await withLinks([data as Omit<Capture, "url" | "thumbUrl">]);
  return saved;
}

/** Deletes one of your photos: the files, then the record (#45) */
export async function deletePhoto(capture: Pick<Capture, "capture_id" | "storage_path" | "thumb_path">) {
  const paths = [capture.storage_path, ...(capture.thumb_path ? [capture.thumb_path] : [])];
  const {error: fileError} = await supabase.storage.from(BUCKET).remove(paths);
  if (fileError) throw new Error(friendlyError(fileError));
  const {error} = await supabase.from("captures").delete().eq("capture_id", capture.capture_id);
  if (error) throw new Error(friendlyError(error));
}

/**
 * The photo that stands for a date in Memories: the end-of-date photo, or
 * else the last one taken. null: none (the grid uses a stop's idea photo)
 */
export function coverPhoto(captures: Capture[]): Capture | null {
  const withLink = captures.filter((c) => c.thumbUrl);
  return withLink.find((c) => c.kind === "END") ?? withLink[withLink.length - 1] ?? null;
}
