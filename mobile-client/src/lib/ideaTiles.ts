// src/lib/ideaTiles.ts
// What an idea shows when it has no photo: a tile for its kind (a color
// and one of the app's icons) instead of one stock photo repeated on every
// card. Two variants per kind, picked by the idea's id, so a row of meals
// doesn't look like one picture copied. The tiles are bundled with the app
// (assets/images/tiles, made from the Ionicons font).

/** A photo's link, or a bundled tile (both work as an expo-image `source`) */
export type IdeaPicture = string | number;

const TILES = {
  meal: [require("@/assets/images/tiles/meal-0.jpg"), require("@/assets/images/tiles/meal-1.jpg")],
  treat: [require("@/assets/images/tiles/treat-0.jpg"), require("@/assets/images/tiles/treat-1.jpg")],
  active: [require("@/assets/images/tiles/active-0.jpg"), require("@/assets/images/tiles/active-1.jpg")],
  outdoors: [require("@/assets/images/tiles/outdoors-0.jpg"), require("@/assets/images/tiles/outdoors-1.jpg")],
  show: [require("@/assets/images/tiles/show-0.jpg"), require("@/assets/images/tiles/show-1.jpg")],
  home: [require("@/assets/images/tiles/home-0.jpg"), require("@/assets/images/tiles/home-1.jpg")],
  other: [require("@/assets/images/tiles/other-0.jpg"), require("@/assets/images/tiles/other-1.jpg")],
} as const;

export type TileKind = keyof typeof TILES;

/** Tags that make an idea a show (music, a play, a museum...) */
const SHOW_TAGS = new Set(["music", "theater", "comedy", "movies", "museums", "festivals"]);

/** Whatever we know about the idea (lists and rows carry different fields) */
type TileIdea = {
  idea_id?: number | string | null;
  modality?: string | null;
  activity_type?: string | null;
  environment?: string | null;
  tags?: string[] | null;
  activity_tags?: {tags?: {name?: string | null} | null}[] | null;
} | null | undefined;

/** The kind of tile an idea gets: stay-in, food, a treat, active, a show, outdoors */
export function tileKind(idea: TileIdea): TileKind {
  if (!idea) return "other";
  if (idea.modality === "STAY_IN") return "home";
  if (idea.activity_type === "MEAL") return "meal";
  if (idea.activity_type === "TREAT") return "treat";
  const tags = idea.tags ?? (idea.activity_tags ?? []).map((at) => at.tags?.name ?? "");
  if (tags.some((t) => SHOW_TAGS.has(t))) return "show";
  if (idea.activity_type === "ACTIVE") return "active";
  if (idea.environment === "OUTDOOR") return "outdoors";
  return "other";
}

/** The tile for an idea without a photo */
export function ideaTile(idea: TileIdea): number {
  const variants = TILES[tileKind(idea)];
  const id = Number(idea?.idea_id) || 0;
  return variants[Math.abs(id) % variants.length];
}
