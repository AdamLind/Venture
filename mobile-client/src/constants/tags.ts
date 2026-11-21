// src/constants/tags.ts
// The tags (#20): four groups, one tile each on Plan's vibes (tap a tile for
// the whole group, hold it to pick within). Each tag is one word where it
// can be, and never repeats a field (feel, how physical, time of year).
// Same list as the database (supabase/migrations/20261120040000_tag_rework.sql).
//
// "Close" is the same for a date and a group date: a group date is couples
// out together, and closeness is why people go on dates at all.

export const TAG_TAXONOMY: Record<string, string[]> = {
  Food: ["casual", "upscale", "cafes", "desserts", "brunch", "global"],
  Active: ["nature", "views", "walks", "water", "adventure", "sports", "games"],
  Shows: ["movies", "music", "comedy", "theater", "museums", "festivals"],
  Close: ["board games", "crafts", "cooking", "spa", "romantic"],
};

/** How a tag is shown, where it isn't just the name capitalized */
const TAG_LABELS: Record<string, string> = {
  cafes: "Cafés",
};

/** "board games" → "Board games", "cafes" → "Cafés" */
export const tagLabel = (tag: string) => TAG_LABELS[tag] ?? tag.charAt(0).toUpperCase() + tag.slice(1);

/**
 * The most tags an idea can have: enough for one that spans groups (a sunset
 * picnic: casual, nature, views, romantic). It keeps tagging focused; the
 * ranking (utils/vibes.ts) already gives padding no advantage.
 */
export const MAX_IDEA_TAGS = 4;

export const BASE_ACTIVITY_CLASSES = [
  {
    id: 1,
    name: "Food",
    icon: "pizza-outline",
    bg: "bg-red-500",
    border: "border-red-500",
    text: "text-red-300",
    rawColor: "#EF4444",
  },
  {
    id: 2,
    name: "Active",
    icon: "american-football-outline",
    bg: "bg-emerald-500",
    border: "border-emerald-500",
    text: "text-emerald-200",
    rawColor: "#10B981",
  },
  {
    id: 3,
    name: "Shows",
    icon: "ticket-outline",
    bg: "bg-violet-500",
    border: "border-violet-500",
    text: "text-violet-300",
    rawColor: "#8B5CF6",
  },
  {
    id: 4,
    name: "Close",
    icon: "heart-outline",
    bg: "bg-pink-500",
    border: "border-pink-500",
    text: "text-pink-500",
    rawColor: "#EC4899",
  },
];
