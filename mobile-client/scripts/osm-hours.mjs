// scripts/osm-hours.mjs
// Opening hours from OpenStreetMap (#5). Matches each public place to its
// OpenStreetMap entry once, then keeps its hours up to date from it. Runs
// daily from GitHub Actions (.github/workflows/osm-hours.yml); each run only
// looks at places that are new or weren't looked at in RECHECK_DAYS, so
// every place is checked about monthly and a new one the next day.
//
//   node scripts/osm-hours.mjs             look up what's due, and save
//   node scripts/osm-hours.mjs --dry-run   show what it would do, save nothing
//   node scripts/osm-hours.mjs --all       everything, due or not
//   node scripts/osm-hours.mjs --limit 20  at most 20 places
//
// Needs EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY,
// from the environment or mobile-client/.env. No packages: plain fetch.
//
// Privacy: only public places are looked up (no owner: seed and listed
// places, or at least one published idea). A private place's pin never
// leaves Venture (#77). OpenStreetMap only gets a place's pin, never who
// added it or anything about anyone.
//
// Matching: the entries with a name within MATCH_METERS of the pin (any part
// of a park or a building counts), then the closest name. A place with no
// good match is left alone and looked at again next month.
//
// Which hours win (decided on #5): a verified owner's (never replaced), then
// OpenStreetMap's, then hours typed in Venture; but Venture hours checked
// after the OpenStreetMap entry was last edited stay. OpenStreetMap hours the
// app can't read (months, holidays, comments) never replace ones it can.
// The data is OpenStreetMap's (© OpenStreetMap contributors, ODbL): the app
// credits it wherever these hours show.

import {Buffer} from "node:buffer";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
/** How close an entry has to be (any part of it) to count */
const MATCH_METERS = 75;
/** How alike the names have to be (0..1, see nameScore) */
const MIN_NAME_SCORE = 0.78;
/** Look a place up again after this long */
const RECHECK_DAYS = 30;
/** Places per Overpass request, and a pause between requests (fair use) */
const BATCH = 20;
const PAUSE_MS = 2000;
/** Tries per request when Overpass is busy (15 s, 30 s, 60 s, then 2 min apart) */
const RETRIES = 6;
const OSM_HOURS_MAX = 255;

// ─── Settings ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ALL = args.includes("--all");
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

// mobile-client/.env, for running it by hand (values already set win)
try {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const line of readFileSync(join(here, "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

// ─── Supabase (the REST API, with the secret key: the server, not a person) ──

const rest = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

/** Every place, with whether it has a published idea */
async function loadPlaces() {
  const base = "venue_id,name,coordinates,created_by,opening_hours,hours_checked_at,activities(visibility)";
  try {
    return await loadPages(`${base},hours_source,osm_id,osm_checked_at`);
  } catch (e) {
    // Before the migration (20261124010000_osm_hours.sql): a dry run still
    // works, as a check of how many places OpenStreetMap has hours for
    if (!DRY_RUN || !/osm_id|hours_source|osm_checked_at/.test(e.message)) throw e;
    console.log("(The OpenStreetMap columns aren't in the database yet: dry run with what's there)");
    return (await loadPages(base)).map((p) => ({...p, hours_source: p.opening_hours ? "community" : null}));
  }
}

async function loadPages(columns) {
  const places = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`venues?select=${columns}&order=venue_id`, {
      headers: {Range: `${from}-${from + 999}`},
    });
    places.push(...page);
    if (page.length < 1000) break;
  }
  return places;
}

// PostGIS hex (EWKB with SRID), as the app reads it (utils/timeline.ts)
function parsePoint(hex) {
  if (typeof hex !== "string" || hex.length < 50) return null;
  const buf = Buffer.from(hex, "hex");
  const little = buf[0] === 1;
  const lng = little ? buf.readDoubleLE(9) : buf.readDoubleBE(9);
  const lat = little ? buf.readDoubleLE(17) : buf.readDoubleBE(17);
  return Number.isFinite(lat) && Number.isFinite(lng) ? {lat, lng} : null;
}

// ─── OpenStreetMap (Overpass) ────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Venture-hours-sync/1.0"},
      body: new URLSearchParams({data: query}),
    });
    if (res.ok) return (await res.json()).elements ?? [];
    // Busy or timed out (429, 502-504): wait and try again, a few times
    if ([429, 502, 503, 504].includes(res.status) && attempt < RETRIES) {
      await sleep(Math.min(120_000, 15_000 * 2 ** (attempt - 1)));
      continue;
    }
    throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Named entries near each place: { venue_id: elements[] } */
export async function nearbyEntries(places) {
  // Each place's entries, then a marker naming the place, so the answer
  // splits back up exactly (an entry near two places shows under both)
  // Near the pin (any part of it within MATCH_METERS), plus the named areas
  // the pin is inside (a pin in the middle of a big park or ski resort is
  // far from its edges)
  const parts = places.map(({at: {lat, lng}, venue_id}) =>
    [
      `is_in(${lat},${lng})->.inside;`,
      `(nwr(around:${MATCH_METERS},${lat},${lng})[name];way(pivot.inside)[name];rel(pivot.inside)[name];);`,
      `out tags center meta;make marker venue="${venue_id}";out;`,
    ].join(""),
  );
  const elements = await overpass(`[out:json][timeout:90];${parts.join("")}`);
  const byPlace = {};
  let current = [];
  for (const el of elements) {
    if (el.type === "marker") {
      byPlace[el.tags.venue] = current;
      current = [];
    } else {
      current.push(el);
    }
  }
  return byPlace;
}

/** The entries already matched: { "node/123": element } */
async function entriesById(ids) {
  const of = (type) =>
    ids.filter((id) => id.startsWith(`${type}/`)).map((id) => id.split("/")[1]);
  const statements = ["node", "way", "relation"]
    .map((type) => [type, of(type)])
    .filter(([, list]) => list.length)
    .map(([type, list]) => `${type}(id:${list.join(",")});`);
  if (!statements.length) return {};
  const elements = await overpass(`[out:json][timeout:90];(${statements.join("")});out tags center meta;`);
  return Object.fromEntries(elements.map((el) => [`${el.type}/${el.id}`, el]));
}

// ─── Matching names ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set(["the", "a", "an", "at", "of", "and", "in", "on"]);
const words = (name) =>
  (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w));
// "taco" and "tacos", "climb" and "climbing" count as the same word
const sameWord = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/**
 * How alike two names are, 0..1: mostly how much of our name is in theirs
 * (60%), the rest how much of theirs is in ours. OpenStreetMap names often
 * add a word ("Nordic Valley" / "Nordic Valley Ski Resort": 0.80, a match);
 * a place named for something inside another isn't that place ("Pioneer
 * Park Farmers Market" / "Pioneer Park": 0.70, no match). Unsure is no
 * match: the place keeps the hours it has.
 */
export function nameScore(ours, theirs) {
  const a = words(ours);
  const b = words(theirs);
  if (!a.length || !b.length) return 0;
  const inB = a.filter((w) => b.some((x) => sameWord(w, x))).length / a.length;
  const inA = b.filter((w) => a.some((x) => sameWord(w, x))).length / b.length;
  return 0.6 * inB + 0.4 * inA;
}

/** The entry's best-matching name (its name, other names, or brand + name) */
const entryScore = (place, el) =>
  Math.max(
    ...["name", "alt_name", "official_name", "short_name", "brand", "name:en"]
      .map((key) => el.tags?.[key])
      .filter(Boolean)
      .map((n) => nameScore(place.name, n)),
  );

const metersBetween = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};
const entryAt = (el) => (el.center ? {lat: el.center.lat, lng: el.center.lon} : {lat: el.lat, lng: el.lon});

// Never a place: roads, towns and neighbourhoods, borders, rivers, homes
// ("Nordic Valley Way" isn't the resort)
const HOMES = new Set(["apartments", "residential", "house", "detached", "dormitory", "terrace"]);
const isPlace = (tags) =>
  !(
    tags.highway ||
    tags.place ||
    tags.boundary ||
    tags.route ||
    tags.railway ||
    tags.waterway ||
    tags.landuse === "residential" ||
    HOMES.has(tags.building)
  );

/** The best entry for a place among the ones near it, or null */
export function bestEntry(place, entries) {
  const scored = entries
    .filter((el) => isPlace(el.tags ?? {}))
    .map((el) => ({el, score: entryScore(place, el), meters: metersBetween(place.at, entryAt(el))}))
    .filter((c) => c.score >= MIN_NAME_SCORE)
    // Best name; nearly as good with hours beats without; then the closest
    .sort(
      (x, y) =>
        (Math.abs(x.score - y.score) > 0.05 ? y.score - x.score : 0) ||
        Number(!!y.el.tags.opening_hours) - Number(!!x.el.tags.opening_hours) ||
        x.meters - y.meters,
    );
  return scored[0] ?? null;
}

// ─── Hours ───────────────────────────────────────────────────────────────────

// The part of the opening_hours format the app reads (utils/openingHours.ts):
// days and day ranges (holidays skipped), times (several, past midnight),
// off/closed, 24/7, sunrise-sunset. Each rule is checked on its own
const DAY = "(?:Mo|Tu|We|Th|Fr|Sa|Su)";
const DAYS = `(?:${DAY}(?:-${DAY})?|PH|SH)(?:,(?:${DAY}(?:-${DAY})?|PH|SH))*`;
const TIME = "(?:[0-2]?\\d:[0-5]\\d|sunrise|sunset)";
// "10:00-22:00", "18:00-02:00", "22:00+" (open until late)
const SPAN = `(?:${TIME}-${TIME}\\+?|${TIME}\\+)`;
const SPANS = `${SPAN}(?:,${SPAN})*`;
const RULE = new RegExp(`^(?:24/7|${SPANS}|${DAYS}\\s+(?:${SPANS}|off|closed))$`);
export const appCanRead = (hours) =>
  !!hours &&
  hours
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .every((rule) => RULE.test(rule));

/** When the entry's hours were last checked: its check date, or its last edit */
function osmCheckedAt(el) {
  const tagged = el.tags["check_date:opening_hours"] || el.tags.check_date;
  const date = tagged && /^\d{4}-\d{2}(-\d{2})?$/.test(tagged) ? new Date(tagged) : null;
  return date && !Number.isNaN(date.getTime()) ? date : new Date(el.timestamp);
}

/** What to save for a place, given its entry (or none) */
export function changesFor(place, el, now) {
  const patch = {osm_checked_at: now.toISOString()};
  if (!el) return {patch, note: "no match"};
  patch.osm_id = `${el.type}/${el.id}`;
  const hours = el.tags.opening_hours?.trim();
  if (!hours) return {patch, note: "matched, no hours in OpenStreetMap"};
  if (hours.length > OSM_HOURS_MAX) return {patch, note: "matched, hours too long"};

  const checked = osmCheckedAt(el);
  const ours = place.opening_hours;
  const source = place.hours_source;
  if (source === "owner") return {patch, note: "kept: a verified owner's hours"};
  if (ours && source === "community") {
    if (place.hours_checked_at && new Date(place.hours_checked_at) > checked) {
      return {patch, note: "kept: Venture's hours are newer"};
    }
    if (appCanRead(ours) && !appCanRead(hours)) {
      return {patch, note: `kept: the app can't read "${hours}"`};
    }
  }
  const sameCheck = place.hours_checked_at && new Date(place.hours_checked_at).getTime() === checked.getTime();
  if (ours === hours && source === "osm" && sameCheck) {
    return {patch, note: "unchanged"};
  }
  patch.opening_hours = hours;
  patch.hours_source = "osm";
  patch.hours_checked_at = checked.toISOString();
  return {patch, note: ours === hours ? "same hours, now credited to OpenStreetMap" : `hours: ${hours}`};
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) or SUPABASE_SECRET_KEY");
  }
  const now = new Date();
  const due = (p) => ALL || !p.osm_checked_at || now - new Date(p.osm_checked_at) > RECHECK_DAYS * 86_400_000;
  const all = await loadPlaces();
  const places = all
    .map((p) => ({...p, at: parsePoint(p.coordinates)}))
    .filter((p) => p.at)
    // Public places only: no owner, or a published idea there
    .filter((p) => p.created_by == null || (p.activities ?? []).some((a) => a.visibility === "PUBLISHED"))
    .filter((p) => p.hours_source !== "owner")
    .filter(due)
    .slice(0, LIMIT);
  console.log(
    `${all.length} places; ${places.length} public and due${DRY_RUN ? " (dry run: nothing is saved)" : ""}`,
  );

  const results = [];
  // A batch Overpass couldn't answer is skipped (not marked as checked), so
  // the next run tries those places again
  let skipped = 0;
  const tryBatch = async (batch, run) => {
    try {
      await run();
    } catch (e) {
      skipped += batch.length;
      console.error(`Skipped ${batch.length} places for now: ${e.message.split("\n")[0]}`);
    }
    await sleep(PAUSE_MS);
  };
  const matched = places.filter((p) => p.osm_id);
  const unmatched = places.filter((p) => !p.osm_id);

  // Already matched: their entries by id (a deleted entry: matched again)
  for (let i = 0; i < matched.length; i += BATCH * 5) {
    const batch = matched.slice(i, i + BATCH * 5);
    await tryBatch(batch, async () => {
      const found = await entriesById(batch.map((p) => p.osm_id));
      for (const p of batch) {
        if (found[p.osm_id]) results.push({place: p, el: found[p.osm_id], how: "by id"});
        else unmatched.push({...p, osm_id: null});
      }
    });
  }

  // Not matched yet: look around their pins
  for (let i = 0; i < unmatched.length; i += BATCH) {
    const batch = unmatched.slice(i, i + BATCH);
    await tryBatch(batch, async () => {
      const near = await nearbyEntries(batch);
      for (const p of batch) {
        const best = bestEntry(p, near[p.venue_id] ?? []);
        results.push({
          place: p,
          el: best?.el ?? null,
          how: best ? `${Math.round(best.meters)} m, name ${best.score.toFixed(2)}` : null,
        });
      }
    });
  }

  const counts = {};
  for (const {place, el, how} of results) {
    const {patch, note} = changesFor(place, el, now);
    const key = note.startsWith("hours:") ? "new hours" : note.split(":")[0];
    counts[key] = (counts[key] ?? 0) + 1;
    const entry = el ? ` → ${el.tags.name ?? "?"} (${el.type}/${el.id}${how ? `, ${how}` : ""})` : "";
    console.log(`${place.name}${entry}: ${note}`);
    if (!DRY_RUN) {
      await rest(`venues?venue_id=eq.${place.venue_id}`, {
        method: "PATCH",
        headers: {Prefer: "return=minimal"},
        body: JSON.stringify(patch),
      });
    }
  }
  if (skipped) counts["skipped (Overpass busy)"] = skipped;
  console.log("\nSummary:", counts);
  // Every batch failed: say so (the workflow shows it as failed)
  if (skipped && skipped === places.length) process.exitCode = 1;
}

// Run when started directly (not when a test imports nameScore / appCanRead)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
