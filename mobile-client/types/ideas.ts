// types/ideas.ts
// Ideas (public.activities) as the Bucket List and My Ideas show them.

export type IdeaVisibility =
  | "PRIVATE"
  | "PENDING_REVIEW"
  | "PUBLISHED"
  | "REJECTED"
  | "NEEDS_REVISION";

/** The columns a list row needs (see IDEA_SUMMARY_COLUMNS). */
export interface IdeaSummary {
  idea_id: number;
  title: string;
  image_urls: string[] | null;
  est_price_per_person: number;
  est_duration_minutes: number;
  modality: "STAY_IN" | "GO_OUT";
  visibility: IdeaVisibility;
  moderation_note: string | null;
  /** Guidelines the last review cited (#85; ids from src/lib/ideaGuidelines.ts) */
  moderation_rules?: string[] | null;
  created_at: string;
  /** When it's best (for planning a date with it) */
  time_of_day?: string[] | null;
  /** For its tile when there's no photo (src/lib/ideaTiles.ts) */
  activity_type?: string | null;
  environment?: string | null;
  exertion?: string | null;
  venues?: {name: string} | null;
}

export interface SavedIdea {
  activity_id: number;
  saved_at: string;
  /** Shared with your partner (#35), or private */
  shared: boolean;
  /** null when the idea was unpublished or deleted since you saved it */
  idea: IdeaSummary | null;
}
