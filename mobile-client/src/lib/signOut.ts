// src/lib/signOut.ts
import {supabase} from "@/src/supabase";
import {useProfileStore} from "@/src/store/useProfileStore";
import {usePrefsStore} from "@/src/store/usePrefsStore";
import {useBuilderStore} from "@/src/store/useBuilderStore";
import {useActiveDateStore} from "@/src/store/activeDateStore";
import {useItineraryStore} from "@/src/store/useItineraryStore";
import {friendlyError} from "@/src/lib/profile";

/** Clears every in-memory store so the next person on this device starts fresh. */
function clearLocalState() {
  useProfileStore.getState().clear();
  useItineraryStore.getState().clear();
  usePrefsStore.getState().resetPrefs();
  useBuilderStore.getState().clearBuilder();
  useActiveDateStore.getState().endActiveDate();
}

/**
 * Signs out and clears every in-memory store, so the next person to sign in
 * on this device doesn't see the previous user's drafts or profile.
 * The root layout redirects to the login screen once the session is gone.
 */
export async function signOut() {
  const {error} = await supabase.auth.signOut();
  if (error) {
    // Couldn't reach the server to revoke the session everywhere;
    // still sign out on this device.
    console.warn("Global sign-out failed, signing out locally:", error.message);
    await supabase.auth.signOut({scope: "local"});
  }
  clearLocalState();
}

/** Every file under `{userId}/` in a bucket, one folder level deep. */
async function listOwnFiles(bucket: string, userId: string): Promise<string[]> {
  const storage = supabase.storage.from(bucket);
  const {data, error} = await storage.list(userId, {limit: 1000});
  if (error || !data) return [];

  const paths: string[] = [];
  for (const entry of data) {
    if (entry.id) {
      paths.push(`${userId}/${entry.name}`);
    } else {
      // A folder (captures are stored as {userId}/{itineraryId}/{file})
      const {data: nested} = await storage.list(`${userId}/${entry.name}`, {
        limit: 1000,
      });
      for (const file of nested ?? []) {
        if (file.id) paths.push(`${userId}/${entry.name}/${file.name}`);
      }
    }
  }
  return paths;
}

/**
 * Permanently deletes the signed-in account: their photos (avatars, date
 * captures), then everything in the database via delete_my_account().
 * Published ideas stay in Explore without their name. Throws on failure.
 */
export async function deleteAccount() {
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You're signed out.");

  // Files first: the database can't delete Storage objects, and once the
  // account is gone we can no longer prove we own them
  let removedAvatar = false;
  for (const bucket of ["avatars", "captures"]) {
    const paths = await listOwnFiles(bucket, user.id);
    if (paths.length > 0) {
      const {error} = await supabase.storage.from(bucket).remove(paths);
      if (error) console.warn(`Couldn't remove ${bucket} files:`, error.message);
      else if (bucket === "avatars") removedAvatar = true;
    }
  }

  const {error} = await supabase.rpc("delete_my_account");
  if (error) {
    // The photo is already gone, so don't leave the profile pointing at it
    if (removedAvatar) {
      await supabase
        .from("users")
        .update({profile_image_url: null})
        .eq("user_id", user.id);
      await useProfileStore.getState().reload();
    }
    throw new Error(
      error.code === "PGRST202"
        ? "Account deletion isn't set up on the server yet."
        : friendlyError(error),
    );
  }

  // The server already revoked the session; just forget it on this device
  await supabase.auth.signOut({scope: "local"});
  clearLocalState();
}
