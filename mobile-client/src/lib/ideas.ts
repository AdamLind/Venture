// src/lib/ideas.ts
// Shared helpers for ideas: list columns, labels, and review statuses.

import type {Ionicons} from "@expo/vector-icons";
import {IMAGE_SIZE, sizedImage} from "@/src/lib/images";
import type {IdeaSummary, IdeaVisibility} from "@/types/ideas";
import {formatMoney} from "@/utils/money";
import {type IdeaPicture, ideaTile} from "@/src/lib/ideaTiles";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Columns for list rows (Bucket List, My Ideas). */
export const IDEA_SUMMARY_COLUMNS = `
  idea_id, title, image_urls, est_price_per_person, est_duration_minutes,
  modality, visibility, moderation_note, moderation_rules, created_at, time_of_day,
  activity_type, environment, exertion,
  venues ( name )
`;

/** The idea's photo, sized for `displayWidth` points; its kind's tile without one */
export function ideaImage(
  idea: {
    image_urls?: string[] | null;
    idea_id?: number | null;
    modality?: string | null;
    activity_type?: string | null;
    environment?: string | null;
    exertion?: string | null;
  },
  displayWidth: number = IMAGE_SIZE.thumb,
): IdeaPicture {
  const photo = idea.image_urls?.[0];
  return photo ? sizedImage(photo, displayWidth) : ideaTile(idea);
}

/** "Free", "$25 pp" */
export function ideaPrice(idea: Pick<IdeaSummary, "est_price_per_person">) {
  const price = Number(idea.est_price_per_person) || 0;
  return price === 0 ? "Free" : `${formatMoney(price)} pp`;
}

/** The most people an idea is stored with when it's for any size of group */
const ANY_GROUP = 20;

/** "2 people", "2–6 people", "4+ people", "Any group size" */
export function peopleLabel(min: number | null | undefined, max: number | null | undefined): string {
  const lo = Math.max(1, Number(min) || 1);
  const hi = Number(max) || ANY_GROUP;
  if (lo <= 1 && hi >= ANY_GROUP) return "Any group size";
  if (hi >= ANY_GROUP) return `${lo}+ people`;
  if (lo === hi) return lo === 1 ? "1 person" : `${lo} people`;
  return `${lo}–${hi} people`;
}

/** "45 min", "2h", "1h 30m" */
export function ideaDuration(idea: Pick<IdeaSummary, "est_duration_minutes">) {
  const minutes = Number(idea.est_duration_minutes) || 0;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export interface IdeaStatus {
  label: string;
  /** One line explaining what the status means for you. */
  detail: string;
  icon: IconName;
  color: string;
}

export const IDEA_STATUS: Record<IdeaVisibility, IdeaStatus> = {
  PUBLISHED: {
    label: "Published",
    detail: "Live in Discover for everyone.",
    icon: "checkmark-circle",
    color: "#34d399",
  },
  PENDING_REVIEW: {
    label: "In review",
    detail: "Waiting for review before it shows in Discover. You can already use it in your own plans.",
    icon: "time",
    color: "#fbbf24",
  },
  NEEDS_REVISION: {
    label: "Needs changes",
    detail: "A reviewer asked for changes before it can go live. Until then it's private to you.",
    icon: "create",
    color: "#fb923c",
  },
  REJECTED: {
    label: "Not approved",
    detail: "This one won't be published, but it's still yours to plan with.",
    icon: "close-circle",
    color: "#f87171",
  },
  PRIVATE: {
    label: "Private",
    detail: "Only you can see it. You can still use it when you plan.",
    icon: "lock-closed",
    color: "#a1a1aa",
  },
};
