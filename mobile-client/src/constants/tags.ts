// src/constants/tags.ts

const intimateTags = ["intimate", "quiet", "create", "views", "spa"];

export const TAG_TAXONOMY: Record<string, string[]> = {
  Food: ["casual", "fancy", "sweets", "soda", "cafes"],
  Active: ["nature", "stroll", "games", "sweat", "seasonal"],
  Shows: ["film", "music", "comedy", "stage", "arts"],
  Cozy: intimateTags,
  Close: intimateTags,
};

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
    name: "Cozy",
    icon: "cafe-outline",
    bg: "bg-orange-400",
    border: "border-orange-400",
    text: "text-orange-200",
    rawColor: "#FB923C",
  },
];

export const DATE_ACTIVITY_CLASS = {
  id: 4,
  name: "Close",
  icon: "heart-outline",
  bg: "bg-pink-500",
  border: "border-pink-500",
  text: "text-pink-500",
  rawColor: "#EC4899",
};
