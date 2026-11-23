// utils/titles.ts
// Titles you earn from the dates you go on (#84), shown under your name on
// Profile: up to three, the hardest one in the middle.
//
// Rules (from the issue):
//   - Only finished dates count, never settings
//   - A share plus a minimum (most need 3+ dates), so one hike doesn't make
//     you an Athlete
//   - No money-based titles, and every title is positive
//   - Recomputed from your dates, so they change with you
//
// Each title has a difficulty (1 easy .. 5 rare) for where it shows, and a
// "because" line for when you tap it. A family (date milestones) shows only
// its highest step.

import type {Itinerary} from "@/types/dates";
import {exertionOf} from "@/utils/ideaTraits";
import {getDistance} from "@/utils/geo";

export type TitleIcon =
  | "restaurant"
  | "ice-cream"
  | "cafe"
  | "sunny"
  | "earth"
  | "barbell"
  | "compass"
  | "leaf"
  | "water"
  | "image"
  | "moon"
  | "partly-sunny"
  | "home"
  | "color-palette"
  | "musical-notes"
  | "happy"
  | "dice"
  | "hammer"
  | "heart"
  | "map"
  | "diamond"
  | "car"
  | "film"
  | "sparkles"
  | "footsteps"
  | "trophy"
  | "ribbon"
  | "star"
  | "flower";

export interface EarnedTitle {
  id: string;
  label: string;
  icon: TitleIcon;
  /** 1 (easy) .. 5 (rare): the hardest shows in the middle */
  difficulty: number;
  /** "12 of your 25 stops were meals or treats" */
  because: string;
  /** How far past the bar you are (ties between equally hard titles) */
  margin: number;
}

type Stop = {
  tags: string[];
  type: string | null;
  environment: string | null;
  modality: string | null;
  exertion: ReturnType<typeof exertionOf>;
  ideaId: number;
  pinned: boolean;
  hour: number | null;
  lat: number | null;
  lng: number | null;
};

/** Your finished dates' stops, as the rules read them */
function stopsOf(dates: Itinerary[]): Stop[] {
  return dates.flatMap((d) =>
    d.stops.flatMap((s) => {
      const a: any = s.activity;
      if (!a) return [];
      const start = s.starts_at ? new Date(s.starts_at) : null;
      return [
        {
          tags: Array.isArray(a.tags) ? a.tags.map((t: string) => String(t).toLowerCase()) : [],
          type: a.activity_type ?? null,
          environment: a.environment ?? null,
          modality: a.modality ?? null,
          exertion: exertionOf(a),
          ideaId: a.idea_id,
          pinned: !!a.venues?.created_by,
          hour: start ? start.getHours() : null,
          lat: typeof a.latitude === "number" ? a.latitude : null,
          lng: typeof a.longitude === "number" ? a.longitude : null,
        },
      ];
    }),
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Every title you've earned, hardest first.
 * `home`: your saved home area (for Road tripper); null leaves it out.
 */
export function earnedTitles(
  allDates: Itinerary[],
  home: {latitude: number; longitude: number} | null = null,
): EarnedTitle[] {
  const dates = allDates.filter((d) => d.status === "COMPLETED");
  const stops = stopsOf(dates);
  const n = stops.length;
  const earned: EarnedTitle[] = [];
  if (!dates.length || !n) return earned;

  const count = (pred: (s: Stop) => boolean) => stops.filter(pred).length;
  const tagged = (...tags: string[]) => count((s) => s.tags.some((t) => tags.includes(t)));
  const add = (t: Omit<EarnedTitle, "margin">, have: number, need: number) =>
    earned.push({...t, margin: need > 0 ? have / need : 1});

  /** A share of your stops, with at least `minDates` dates and `minStops` stops */
  const share = (
    have: number,
    atLeast: number,
    t: Omit<EarnedTitle, "margin" | "because">,
    what: string,
    minDates = 3,
    minStops = 3,
  ) => {
    if (dates.length < minDates || have < minStops || have / n < atLeast) return;
    add({...t, because: `${have} of your ${plural(n, "stop")} ${what}`}, have / n, atLeast);
  };
  /** A number of stops (across at least 2 dates, so it isn't one big day) */
  const several = (have: number, need: number, t: Omit<EarnedTitle, "margin" | "because">, what: string) => {
    if (dates.length < 2 || have < need) return;
    add({...t, because: `${plural(have, "stop")} ${what}`}, have, need);
  };

  // ─── What you do ─────────────────────────────────────────────────────────
  share(
    count((s) => s.type === "MEAL" || s.type === "TREAT"),
    0.4,
    {id: "foodie", label: "Foodie", icon: "restaurant", difficulty: 2},
    "were meals or treats",
  );
  several(
    tagged("desserts"),
    4,
    {id: "sweet-tooth", label: "Sweet tooth", icon: "ice-cream", difficulty: 1},
    "for dessert",
  );
  several(tagged("brunch"), 3, {id: "brunch-club", label: "Brunch club", icon: "sunny", difficulty: 1}, "at brunch");
  several(
    tagged("cafes"),
    3,
    {id: "coffee-date-pro", label: "Coffee date pro", icon: "cafe", difficulty: 1},
    "at cafes",
  );
  several(
    tagged("global"),
    4,
    {id: "taste-traveler", label: "Taste traveler", icon: "earth", difficulty: 2},
    "of food from around the world",
  );
  share(
    count((s) => s.exertion === "HARD"),
    0.3,
    {id: "athlete", label: "Athlete", icon: "barbell", difficulty: 3},
    "got your heart pumping",
  );
  several(
    tagged("adventure"),
    4,
    {id: "adventurer", label: "Adventurer", icon: "compass", difficulty: 2},
    "of adventure",
  );
  share(
    count((s) => s.environment === "OUTDOOR"),
    0.5,
    {id: "outdoorsy", label: "Outdoorsy", icon: "leaf", difficulty: 2},
    "were outside",
  );
  several(
    tagged("water"),
    3,
    {id: "water-lover", label: "Water lover", icon: "water", difficulty: 2},
    "on or by the water",
  );
  several(tagged("views"), 3, {id: "view-chaser", label: "View chaser", icon: "image", difficulty: 1}, "with a view");
  several(
    tagged("walks"),
    4,
    {id: "stroll-pro", label: "Stroll pro", icon: "footsteps", difficulty: 1},
    "out for a walk",
  );
  several(
    tagged("museums", "theater"),
    4,
    {id: "culture-buff", label: "Culture buff", icon: "color-palette", difficulty: 2},
    "at museums or the theater",
  );
  several(
    tagged("music"),
    3,
    {id: "music-lover", label: "Music lover", icon: "musical-notes", difficulty: 1},
    "with live music",
  );
  several(tagged("comedy"), 3, {id: "comedy-lover", label: "Comedy lover", icon: "happy", difficulty: 1}, "at comedy");
  several(
    tagged("games", "board games"),
    4,
    {id: "game-night-champ", label: "Game night champ", icon: "dice", difficulty: 1},
    "playing games",
  );
  several(
    tagged("crafts", "cooking"),
    3,
    {id: "maker", label: "Maker", icon: "hammer", difficulty: 1},
    "making something together",
  );
  several(tagged("movies"), 4, {id: "movie-buff", label: "Movie buff", icon: "film", difficulty: 1}, "at the movies");
  several(tagged("spa"), 3, {id: "pampered-pro", label: "Pampered pro", icon: "flower", difficulty: 1}, "at the spa");
  several(
    tagged("festivals"),
    3,
    {id: "festival-goer", label: "Festival goer", icon: "sparkles", difficulty: 2},
    "at festivals",
  );
  share(
    tagged("romantic"),
    0.5,
    {id: "romantic-at-heart", label: "Romantic at heart", icon: "heart", difficulty: 3},
    "were romantic",
    5,
    5,
  );

  // ─── When ────────────────────────────────────────────────────────────────
  share(
    count((s) => s.hour != null && (s.hour >= 21 || s.hour < 4)),
    0.3,
    {id: "night-owl", label: "Night owl", icon: "moon", difficulty: 2},
    "started after 9pm",
  );
  share(
    count((s) => s.hour != null && s.hour >= 4 && s.hour < 10),
    0.3,
    {id: "early-bird", label: "Early bird", icon: "partly-sunny", difficulty: 2},
    "started before 10am",
  );

  // ─── How ─────────────────────────────────────────────────────────────────
  // Stay-in dates: every stop at home
  const stayIn = dates.filter((d) => {
    const live = d.stops.filter((s) => s.activity);
    return live.length > 0 && live.every((s) => (s.activity as any).modality === "STAY_IN");
  }).length;
  if (dates.length >= 3 && stayIn / dates.length >= 0.5) {
    add(
      {
        id: "cozy-night-pro",
        label: "Cozy night pro",
        icon: "home",
        difficulty: 2,
        because: `${stayIn} of your ${plural(dates.length, "date")} were nights in`,
      },
      stayIn / dates.length,
      0.5,
    );
  }

  // Lots of different things, rarely the same idea twice
  const tagsTried = new Set(stops.flatMap((s) => s.tags)).size;
  const ideasTried = new Set(stops.map((s) => s.ideaId)).size;
  if (dates.length >= 8 && tagsTried >= 15 && ideasTried / n >= 0.8) {
    add(
      {
        id: "explorer",
        label: "Explorer",
        icon: "map",
        difficulty: 4,
        because: `${tagsTried} kinds of things across ${plural(ideasTried, "different idea")}`,
      },
      tagsTried,
      15,
    );
  }

  // Places someone in the community pinned (hidden gems)
  const gems = new Set(stops.filter((s) => s.pinned).map((s) => s.ideaId)).size;
  if (gems >= 5) {
    add(
      {
        id: "hidden-gem-hunter",
        label: "Hidden gem hunter",
        icon: "diamond",
        difficulty: 4,
        because: `${plural(gems, "place")} found by the community, not the map`,
      },
      gems,
      5,
    );
  }

  // Far from home, on average (go-out stops with a place)
  if (home && dates.length >= 3) {
    const away = stops
      .filter((s) => s.modality !== "STAY_IN" && s.lat != null && s.lng != null)
      .map((s) => getDistance(home, {latitude: s.lat!, longitude: s.lng!}));
    const avg = away.length ? away.reduce((a, b) => a + b, 0) / away.length : 0;
    if (away.length >= 3 && avg >= 15) {
      add(
        {
          id: "road-tripper",
          label: "Road tripper",
          icon: "car",
          difficulty: 3,
          because: `Your stops average ${Math.round(avg)} miles from home`,
        },
        avg,
        15,
      );
    }
  }

  // ─── How many: only the highest step shows ───────────────────────────────
  const MILESTONES = [
    {need: 50, id: "hall-of-fame", label: "Hall of fame", icon: "trophy" as const, difficulty: 5},
    {need: 25, id: "date-night-legend", label: "Date night legend", icon: "star" as const, difficulty: 4},
    {need: 10, id: "date-night-regular", label: "Date night regular", icon: "ribbon" as const, difficulty: 3},
  ];
  const step = MILESTONES.find((m) => dates.length >= m.need);
  if (step) {
    add(
      {
        id: step.id,
        label: step.label,
        icon: step.icon,
        difficulty: step.difficulty,
        because: `${plural(dates.length, "date")} and counting`,
      },
      dates.length,
      step.need,
    );
  }

  return earned.sort((a, b) => b.difficulty - a.difficulty || b.margin - a.margin);
}

/**
 * The three to show, laid out left to right: the hardest in the middle, the
 * next on the left, the third on the right. Two: hardest first. One: alone.
 */
export function titleLayout(titles: EarnedTitle[]): {title: EarnedTitle; main: boolean}[] {
  const [first, second, third] = titles;
  if (!first) return [];
  if (!second) return [{title: first, main: true}];
  if (!third)
    return [
      {title: first, main: true},
      {title: second, main: false},
    ];
  return [
    {title: second, main: false},
    {title: first, main: true},
    {title: third, main: false},
  ];
}

/** Finished dates still needed before titles start */
export const DATES_FOR_TITLES = 3;
