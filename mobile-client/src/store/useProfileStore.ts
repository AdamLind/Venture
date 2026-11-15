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
  uploadAvatar: (localUri: string) => Promise<void>;
  clear: () => void;
}

const PROFILE_COLUMNS =
  "user_id, username, first_name, last_name, profile_image_url, created_at";

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

    const [profileRes, prefsRes] = await Promise.all([
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
    ]);

    // The user signed out or switched accounts while we were loading
    if (get().userId !== userId) return;

    const error = profileRes.error ?? prefsRes.error;
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

    set({
      profile: profileRes.data as UserProfile,
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
    set({profile: data as UserProfile});
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

  uploadAvatar: async (localUri) => {
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

    const {data} = supabase.storage.from("avatars").getPublicUrl(path);
    await updateProfile({profile_image_url: data.publicUrl});

    // Best effort: remove the previous avatar file if it was one of ours
    const oldUrl = profile?.profile_image_url;
    const oldPath = oldUrl?.split(AVATAR_PATH_MARKER)[1];
    if (oldPath && oldPath.startsWith(`${userId}/`)) {
      supabase.storage
        .from("avatars")
        .remove([oldPath])
        .then(({error}) => {
          if (error) console.warn("Old avatar cleanup failed:", error.message);
        });
    }
  },

  clear: () => set(initialState),
}));
