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

// ─── Every title ───────────────────────────────────────────────────────────────
// The titles menu lists them all: how to earn each one, except a few mystery
// titles that only show their name until you have them.

export interface TitleInfo {
  label: string;
  icon: TitleIcon;
  /** 1 (easy) .. 5 (rare) */
  difficulty: number;
  /** How to earn it, for the menu */
  how: string;
  /** A mystery title: its name shows, how to earn it doesn't */
  secret?: boolean;
}

export const TITLES = {
  // What you do
  foodie: {label: "Foodie", icon: "restaurant", difficulty: 2, how: "Make meals or treats at least 40% of your stops, over 3 or more dates."},
  "sweet-tooth": {label: "Sweet tooth", icon: "ice-cream", difficulty: 1, how: "Stop for dessert 4 times, over 2 or more dates."},
  "brunch-club": {label: "Brunch club", icon: "sunny", difficulty: 1, how: "Go out for brunch 3 times, over 2 or more dates."},
  "coffee-date-pro": {label: "Coffee date pro", icon: "cafe", difficulty: 1, how: "Have 3 stops at cafes, over 2 or more dates."},
  "taste-traveler": {label: "Taste traveler", icon: "earth", difficulty: 2, how: "Eat food from around the world 4 times, over 2 or more dates."},
  athlete: {label: "Athlete", icon: "barbell", difficulty: 3, how: "Make 30% of your stops a real workout, over 3 or more dates."},
  adventurer: {label: "Adventurer", icon: "compass", difficulty: 2, how: "Go on 4 adventures, over 2 or more dates."},
  outdoorsy: {label: "Outdoorsy", icon: "leaf", difficulty: 2, how: "Spend half your stops outside, over 3 or more dates."},
  "water-lover": {label: "Water lover", icon: "water", difficulty: 2, how: "Have 3 stops on or by the water, over 2 or more dates."},
  "view-chaser": {label: "View chaser", icon: "image", difficulty: 1, how: "Have 3 stops with a view, over 2 or more dates."},
  "stroll-pro": {label: "Stroll pro", icon: "footsteps", difficulty: 1, how: "Go out for a walk 4 times, over 2 or more dates."},
  "culture-buff": {label: "Culture buff", icon: "color-palette", difficulty: 2, how: "Visit museums or the theater 4 times, over 2 or more dates."},
  "music-lover": {label: "Music lover", icon: "musical-notes", difficulty: 1, how: "See live music 3 times, over 2 or more dates."},
  "comedy-lover": {label: "Comedy lover", icon: "happy", difficulty: 1, how: "See comedy 3 times, over 2 or more dates."},
  "game-night-champ": {label: "Game night champ", icon: "dice", difficulty: 1, how: "Play games on 4 stops, over 2 or more dates."},
  maker: {label: "Maker", icon: "hammer", difficulty: 1, how: "Make something together 3 times (crafts or cooking), over 2 or more dates."},
  "movie-buff": {label: "Movie buff", icon: "film", difficulty: 1, how: "Go to the movies 4 times, over 2 or more dates."},
  "pampered-pro": {label: "Pampered pro", icon: "flower", difficulty: 1, how: "Have 3 spa stops, over 2 or more dates."},
  "festival-goer": {label: "Festival goer", icon: "sparkles", difficulty: 2, how: "Go to 3 festivals, over 2 or more dates."},
  "romantic-at-heart": {label: "Romantic at heart", icon: "heart", difficulty: 3, how: "Make half your stops romantic, over 5 or more dates.", secret: true},
  // When
  "night-owl": {label: "Night owl", icon: "moon", difficulty: 2, how: "Start 30% of your stops after 9pm, over 3 or more dates."},
  "early-bird": {label: "Early bird", icon: "partly-sunny", difficulty: 2, how: "Start 30% of your stops before 10am, over 3 or more dates."},
  // How
  "cozy-night-pro": {label: "Cozy night pro", icon: "home", difficulty: 2, how: "Make half your dates nights in, over 3 or more dates."},
  explorer: {label: "Explorer", icon: "map", difficulty: 4, how: "Try 15 kinds of things over 8 dates, rarely the same idea twice.", secret: true},
  "hidden-gem-hunter": {label: "Hidden gem hunter", icon: "diamond", difficulty: 4, how: "Visit 5 places the community pinned, not the map.", secret: true},
  "road-tripper": {label: "Road tripper", icon: "car", difficulty: 3, how: "Average 15 miles or more from your home area, over 3 or more dates (needs a home area)."},
  // How many (only the highest shows on Profile)
  "date-night-regular": {label: "Date night regular", icon: "ribbon", difficulty: 3, how: "Finish 10 dates."},
  "date-night-legend": {label: "Date night legend", icon: "star", difficulty: 4, how: "Finish 25 dates."},
  "hall-of-fame": {label: "Hall of fame", icon: "trophy", difficulty: 5, how: "Finish 50 dates."},
} satisfies Record<string, TitleInfo>;

export type TitleId = keyof typeof TITLES;

/** A title's name, icon and difficulty, for the rules below */
const T = (id: TitleId) => ({id, label: TITLES[id].label, icon: TITLES[id].icon as TitleIcon, difficulty: TITLES[id].difficulty});

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
    T("foodie"),
    "were meals or treats",
  );
  several(
    tagged("desserts"),
    4,
    T("sweet-tooth"),
    "for dessert",
  );
  several(tagged("brunch"), 3, T("brunch-club"), "at brunch");
  several(
    tagged("cafes"),
    3,
    T("coffee-date-pro"),
    "at cafes",
  );
  several(
    tagged("global"),
    4,
    T("taste-traveler"),
    "of food from around the world",
  );
  share(
    count((s) => s.exertion === "HARD"),
    0.3,
    T("athlete"),
    "got your heart pumping",
  );
  several(
    tagged("adventure"),
    4,
    T("adventurer"),
    "of adventure",
  );
  share(
    count((s) => s.environment === "OUTDOOR"),
    0.5,
    T("outdoorsy"),
    "were outside",
  );
  several(
    tagged("water"),
    3,
    T("water-lover"),
    "on or by the water",
  );
  several(tagged("views"), 3, T("view-chaser"), "with a view");
  several(
    tagged("walks"),
    4,
    T("stroll-pro"),
    "out for a walk",
  );
  several(
    tagged("museums", "theater"),
    4,
    T("culture-buff"),
    "at museums or the theater",
  );
  several(
    tagged("music"),
    3,
    T("music-lover"),
    "with live music",
  );
  several(tagged("comedy"), 3, T("comedy-lover"), "at comedy");
  several(
    tagged("games", "board games"),
    4,
    T("game-night-champ"),
    "playing games",
  );
  several(
    tagged("crafts", "cooking"),
    3,
    T("maker"),
    "making something together",
  );
  several(tagged("movies"), 4, T("movie-buff"), "at the movies");
  several(tagged("spa"), 3, T("pampered-pro"), "at the spa");
  several(
    tagged("festivals"),
    3,
    T("festival-goer"),
    "at festivals",
  );
  share(
    tagged("romantic"),
    0.5,
    T("romantic-at-heart"),
    "were romantic",
    5,
    5,
  );

  // ─── When ────────────────────────────────────────────────────────────────
  share(
    count((s) => s.hour != null && (s.hour >= 21 || s.hour < 4)),
    0.3,
    T("night-owl"),
    "started after 9pm",
  );
  share(
    count((s) => s.hour != null && s.hour >= 4 && s.hour < 10),
    0.3,
    T("early-bird"),
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
        ...T("cozy-night-pro"),
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
        ...T("explorer"),
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
        ...T("hidden-gem-hunter"),
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
        ...T("road-tripper"),
        because: `Your stops average ${Math.round(avg)} miles from home`,
        },
        avg,
        15,
      );
    }
  }

  // ─── How many: only the highest step shows ───────────────────────────────
  const MILESTONES = [
    {need: 50, ...T("hall-of-fame")},
    {need: 25, ...T("date-night-legend")},
    {need: 10, ...T("date-night-regular")},
  ];
  const step = MILESTONES.find((m) => dates.length >= m.need);
  if (step) {
    add(
      {
        ...T(step.id),
        because: `${plural(dates.length, "date")} and counting`,
      },
      dates.length,
      step.need,
    );
  }

  return earned.sort((a, b) => b.difficulty - a.difficulty || b.margin - a.margin);
}

/**
 * The titles to show on Profile, best first: the ones you picked (in your
 * order, skipping any you no longer have), or the hardest three.
 */
export function shownTitles(earned: EarnedTitle[], featured: string[] | null | undefined): EarnedTitle[] {
  const picked = (featured ?? [])
    .map((id) => earned.find((t) => t.id === id))
    .filter((t): t is EarnedTitle => !!t);
  return picked.length ? picked.slice(0, 3) : earned.slice(0, 3);
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
