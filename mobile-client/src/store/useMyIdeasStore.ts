// src/store/useMyIdeasStore.ts
// Ideas the signed-in user created, in every review state. Loaded by the root
// layout after sign-in and reloaded after creating or changing one.

import {create} from "zustand";
import {supabase} from "@/src/supabase";
import {friendlyError} from "@/src/lib/profile";
import {IDEA_SUMMARY_COLUMNS} from "@/src/lib/ideas";
import type {IdeaSummary, IdeaVisibility} from "@/types/ideas";

type Status = "idle" | "loading" | "ready" | "error";

interface MyIdeasState {
  userId: string | null;
  /** Newest first. */
  ideas: IdeaSummary[];
  status: Status;
  error: string | null;

  load: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
  /**
   * Moves an idea between the states its owner controls: PRIVATE and
   * PENDING_REVIEW (the database refuses anything else, e.g. self-publishing).
   */
  setVisibility: (
    ideaId: number,
    visibility: Extract<IdeaVisibility, "PRIVATE" | "PENDING_REVIEW">,
  ) => Promise<void>;
  /** Deletes an idea and (best effort) its photos. Throws a readable Error. */
  remove: (ideaId: number) => Promise<void>;
  clear: () => void;
}

const initialState = {
  userId: null,
  ideas: [],
  status: "idle" as Status,
  error: null,
};

const PHOTO_PATH_MARKER = "/storage/v1/object/public/activities/";

export const useMyIdeasStore = create<MyIdeasState>((set, get) => ({
  ...initialState,

  load: async (userId) => {
    set({userId, status: "loading", error: null});

    const {data, error} = await supabase
      .from("activities")
      .select(IDEA_SUMMARY_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", {ascending: false});

    if (get().userId !== userId) return;

    if (error) {
      set({status: "error", error: friendlyError(error)});
      return;
    }
    set({ideas: (data ?? []) as unknown as IdeaSummary[], status: "ready"});
  },

  reload: async () => {
    const {userId, load} = get();
    if (userId) await load(userId);
  },

  setVisibility: async (ideaId, visibility) => {
    // Resubmitting starts a fresh review; withdrawing keeps the last note
    // so you still have the feedback when you come back to it
    const resubmit = visibility === "PENDING_REVIEW";
    const {data, error} = await supabase
      .from("activities")
      .update(resubmit ? {visibility, moderation_note: null} : {visibility})
      .eq("idea_id", ideaId)
      .select("idea_id")
      .maybeSingle();
    if (error) throw new Error(friendlyError(error));
    if (!data) throw new Error("Couldn't update that idea.");

    set({
      ideas: get().ideas.map((idea) =>
        idea.idea_id === ideaId
          ? {...idea, visibility, moderation_note: resubmit ? null : idea.moderation_note}
          : idea,
      ),
    });
  },

  remove: async (ideaId) => {
    const idea = get().ideas.find((i) => i.idea_id === ideaId);

    const {error} = await supabase.from("activities").delete().eq("idea_id", ideaId);
    if (error) throw new Error(friendlyError(error));

    set({ideas: get().ideas.filter((i) => i.idea_id !== ideaId)});

    // Best effort: remove its photos from storage
    const paths = (idea?.image_urls ?? [])
      .map((url) => url.split(PHOTO_PATH_MARKER)[1])
      .filter((path): path is string => !!path);
    if (paths.length > 0) {
      const {error: storageError} = await supabase.storage
        .from("activities")
        .remove(paths);
      if (storageError) {
        console.warn("Couldn't remove idea photos:", storageError.message);
      }
    }
  },

  clear: () => set(initialState),
}));
