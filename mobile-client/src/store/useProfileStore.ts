// src/store/useProfileStore.ts
// Holds the signed-in user's profile (public.users) and private preferences
// (public.user_preferences). Loaded by the root layout whenever the session changes.

import {create} from "zustand";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import type {
  PreferencesUpdate,
  ProfileUpdate,
  UserPreferences,
  UserProfile,
} from "@/types/profile";

type Status = "idle" | "loading" | "ready" | "error";

interface ProfileState {
  userId: string | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  status: Status;
  error: string | null;

  load: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
  /** Throws an Error with a readable message on failure. */
  updateProfile: (changes: ProfileUpdate) => Promise<void>;
  /** Throws an Error with a readable message on failure. */
  updatePreferences: (changes: PreferencesUpdate) => Promise<void>;
  /** Uploads a local JPEG to the avatars bucket and saves its URL. */
  /** The photo (1080 px) and its thumbnail (256 px: src/lib/images.ts) */
  uploadAvatar: (localUri: string, thumbUri?: string) => Promise<void>;
  clear: () => void;
}

// Everyone can read these; your own first and last name come from my_name()
// (other people never see them, #28)
const PROFILE_COLUMNS = "user_id, username, profile_image_url, created_at";

type Names = {first_name: string | null; last_name: string | null};

const AVATAR_PATH_MARKER = "/storage/v1/object/public/avatars/";

const initialState = {
  userId: null,
  profile: null,
  preferences: null,
  status: "idle" as Status,
  error: null,
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...initialState,

  load: async (userId) => {
    set({userId, status: "loading", error: null});

    const [profileRes, prefsRes, namesRes] = await Promise.all([
      supabase
        .from("users")
        .select(PROFILE_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.rpc("my_name"),
    ]);

    // The user signed out or switched accounts while we were loading
    if (get().userId !== userId) return;

    const error = profileRes.error ?? prefsRes.error ?? namesRes.error;
    if (error || !profileRes.data || !prefsRes.data) {
      if (error) console.error("Profile load failed:", error);
      set({
        status: "error",
        error: error
          ? friendlyError(error)
          : "We couldn't find your profile. Try again, or sign out and back in.",
      });
      return;
    }

    const names = ((namesRes.data as Names[] | null)?.[0] ?? {first_name: null, last_name: null}) as Names;
    set({
      profile: {...(profileRes.data as Omit<UserProfile, keyof Names>), ...names},
      preferences: prefsRes.data as UserPreferences,
      status: "ready",
      error: null,
    });
  },

  reload: async () => {
    const {userId, load} = get();
    if (userId) await load(userId);
  },

  updateProfile: async (changes) => {
    const userId = get().userId;
    if (!userId) throw new Error("You're signed out.");

    const {data, error} = await supabase
      .from("users")
      .update(changes)
      .eq("user_id", userId)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw new Error(friendlyError(error));
    // The names aren't readable back: keep what was just saved, or what we had
    const prev = get().profile;
    set({
      profile: {
        ...(data as Omit<UserProfile, keyof Names>),
        first_name: "first_name" in changes ? (changes.first_name ?? null) : (prev?.first_name ?? null),
        last_name: "last_name" in changes ? (changes.last_name ?? null) : (prev?.last_name ?? null),
      },
    });
  },

  updatePreferences: async (changes) => {
    const userId = get().userId;
    if (!userId) throw new Error("You're signed out.");

    const {data, error} = await supabase
      .from("user_preferences")
      .update(changes)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw new Error(friendlyError(error));
    set({preferences: data as UserPreferences});
  },

  uploadAvatar: async (localUri, thumbUri) => {
    const {userId, profile, updateProfile} = get();
    if (!userId) throw new Error("You're signed out.");

    // Unique file name per upload so cached images never show the old avatar
    const path = `${userId}/${Date.now()}.jpg`;
    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();

    const {error: uploadError} = await supabase.storage
      .from("avatars")
      .upload(path, arrayBuffer, {contentType: "image/jpeg"});
    if (uploadError) throw new Error(friendlyError(uploadError));

    // Its thumbnail next to it (best effort: avatars fall back to the photo)
    if (thumbUri) {
      try {
        const thumb = await (await fetch(thumbUri)).arrayBuffer();
        const {error} = await supabase.storage
          .from("avatars")
          .upload(path.replace(/\.jpg$/, "_thumb.jpg"), thumb, {contentType: "image/jpeg"});
        if (error) console.warn("Avatar thumbnail upload failed:", error.message);
      } catch (e) {
        console.warn("Avatar thumbnail upload failed:", e);
      }
    }

    const {data} = supabase.storage.from("avatars").getPublicUrl(path);
    await updateProfile({profile_image_url: data.publicUrl});

    // Best effort: remove the previous avatar file if it was one of ours
    const oldUrl = profile?.profile_image_url;
    const oldPath = oldUrl?.split(AVATAR_PATH_MARKER)[1];
    if (oldPath && oldPath.startsWith(`${userId}/`)) {
      supabase.storage
        .from("avatars")
        .remove([oldPath, oldPath.replace(/\.jpg$/, "_thumb.jpg")])
        .then(({error}) => {
          if (error) console.warn("Old avatar cleanup failed:", error.message);
        });
    }
  },

  clear: () => set(initialState),
}));
