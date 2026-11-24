// scripts/import-ideas.mjs
// The launch ideas (#71): written as files in content/ideas/*.json (see
// content/ideas/README.md), checked, then posted by the official @venture
// account. New ideas go to the moderation queue (Settings › Moderation) so
// each is seen in the app before it's public; nothing goes live unchecked.
//
//   node scripts/import-ideas.mjs              check every file (saves nothing)
//   node scripts/import-ideas.mjs --import     check, then save the ideas that pass
//   node scripts/import-ideas.mjs --import --publish   ...new ones straight to Discover
//   node scripts/import-ideas.mjs --import --retire    ...and hide @venture ideas
//                                              taken out of the files
//   node scripts/import-ideas.mjs --photos     also check that photo links load
//   node scripts/import-ideas.mjs content/ideas/provo.json   just that file
//
// Re-running is safe: each idea has a stable key, so a changed idea is
// updated (keeping its review status), an unchanged one is left alone.
// Ideas with problems marked ✗ are skipped; ! is worth a look but imports.
// "status": "draft" ideas are only checked.
//
// Places: a place already on Venture (a public one within 75 m with the
// same name) is reused; otherwise it's added as a listed place (no owner,
// so public). The daily OpenStreetMap job (osm-hours.mjs) may fill or
// update its hours.
//
// Needs EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY,
// from the environment or mobile-client/.env. No packages: plain fetch.

import {Buffer} from "node:buffer";
import {existsSync, readdirSync, readFileSync, statSync} from "node:fs";
import {basename, dirname, extname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {appCanRead, nameScore} from "./osm-hours.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(HERE, "..", "..", "content", "ideas");

// ─── What ideas may say (the same as the app's posting form) ─────────────────

const TYPES = ["MEAL", "TREAT", "ACTIVE", "OTHER"];
const ENVIRONMENTS = ["INDOOR", "OUTDOOR", "MIXED"];
const TIMES = ["EARLY_MORNING", "MORNING", "AFTERNOON", "EVENING", "LATE_NIGHT"];
const WEATHER = ["ANY", "NICE", "WARM", "COLD"];
const FEELS = ["CALM", "UPBEAT"];
const EXERTIONS = ["NONE", "LIGHT", "HARD"];
const HOLIDAYS = ["VALENTINES", "INDEPENDENCE_DAY", "HALLOWEEN", "CHRISTMAS", "NEW_YEARS_EVE"];
const RISKS = ["STRENUOUS", "HEIGHTS", "WATER", "REMOTE", "PERMIT", "GUIDE"];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)+$/;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 40;
const DESCRIPTION_MAX = 600;
const NOTE_MAX = 300;
/** A pin farther than this from the file's "center" is probably a typo */
const FAR_MILES = 80;
/** Reusing a place already on Venture: this close, and the name this alike */
const SAME_PLACE_METERS = 75;
const SAME_NAME = 0.78;
/** Local photos are uploaded as they are: bigger than this, resize first */
const PHOTO_MAX_BYTES = 600_000;
const PHOTO_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"};

const OFFICIAL_USERNAME = "venture";

// ─── Settings ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const IMPORT = args.includes("--import");
const PUBLISH = args.includes("--publish");
const RETIRE = args.includes("--retire");
const CHECK_PHOTOS = args.includes("--photos");
const fileArgs = args.filter((a) => !a.startsWith("--"));

try {
  for (const line of readFileSync(join(HERE, "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const headers = (extra = {}) => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  ...extra,
});
async function call(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: headers({"Content-Type": "application/json", ...init.headers}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const rest = (path, init) => call(`/rest/v1/${path}`, init);

// ─── Reading the files ───────────────────────────────────────────────────────

function ideaFiles() {
  if (fileArgs.length) return fileArgs.map((f) => resolve(f));
  if (!existsSync(CONTENT_DIR)) return [];
  // (files starting with _ are examples)
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => join(CONTENT_DIR, f));
}

/** "40.2671, -111.6347" (pasted from a map) or {lat, lng} */
function parsePin(pin) {
  if (pin && typeof pin === "object" && Number.isFinite(pin.lat) && Number.isFinite(pin.lng)) return pin;
  const m = typeof pin === "string" && pin.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const at = {lat: Number(m[1]), lng: Number(m[2])};
  return Math.abs(at.lat) <= 90 && Math.abs(at.lng) <= 180 ? at : null;
}

const milesBetween = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3959 * Math.asin(Math.sqrt(h));
};

// PostGIS hex (EWKB with SRID), as the app reads it
function parsePoint(hex) {
  if (typeof hex !== "string" || hex.length < 50) return null;
  const buf = Buffer.from(hex, "hex");
  const little = buf[0] === 1;
  return {lat: little ? buf.readDoubleLE(17) : buf.readDoubleBE(17), lng: little ? buf.readDoubleLE(9) : buf.readDoubleBE(9)};
}

/** Hours as written ("daylight", "24/7", OpenStreetMap format, "unknown") → stored */
const storedHours = (hours) => (hours === "daylight" ? "sunrise-sunset" : hours === "unknown" ? null : hours ?? null);

// ─── Checking ────────────────────────────────────────────────────────────────

/** Checks a place (inline or from the file's "places"); pushes problems */
function checkPlace(place, problem, center) {
  if (!place.name?.trim()) problem("✗", "the place has no name");
  const at = parsePin(place.pin);
  const swapped = typeof place.pin === "string" && /^\s*-?\d{3}/.test(place.pin);
  if (!at) {
    problem("✗", `the place's pin isn't "lat, lng" (got ${JSON.stringify(place.pin)}${swapped ? ": lat and lng swapped?" : ""})`);
  }
  else if (center && milesBetween(center, at) > FAR_MILES) {
    problem("!", `the pin is ${Math.round(milesBetween(center, at))} mi from the city (lat and lng swapped?)`);
  }
  if (!place.address?.trim()) problem("!", "the place has no address");
  if (place.hours === undefined) problem("!", 'no hours ("daylight", "24/7", OpenStreetMap format, or "unknown")');
  else if (place.hours !== "unknown" && place.hours !== "daylight") {
    if (typeof place.hours !== "string" || place.hours.length > 255) problem("✗", "the hours aren't text up to 255 characters");
    else if (!appCanRead(place.hours)) problem("!", `the app can't read the hours "${place.hours}" (they'll count as unknown)`);
  }
  if (place.access_note && place.access_note.length > NOTE_MAX) problem("✗", `access_note is over ${NOTE_MAX} characters`);
  return at;
}

/** Every idea in a file, with its problems and what it'd save */
function checkFile(file, tags) {
  const problems = [];
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return {file, fatal: `isn't valid JSON: ${e.message}`, ideas: []};
  }
  const city = data.city;
  const center = parsePin(data.center);
  if (!city || !/^[a-z0-9-]+$/.test(city)) return {file, fatal: '"city" must be lowercase, like "provo"', ideas: []};

  const places = new Map();
  for (const place of data.places ?? []) {
    if (!place.id) problems.push(`place without an "id": ${place.name ?? "?"}`);
    else places.set(place.id, place);
  }

  const seenKeys = new Set();
  const seenTitles = new Map();
  const ideas = (data.ideas ?? []).map((idea) => {
    const issues = [];
    const problem = (level, text) => issues.push({level, text});
    const has = (field) => idea[field] !== undefined && idea[field] !== null;

    // Who it is
    if (!idea.key || !KEY.test(idea.key)) problem("✗", 'key must look like "provo/rock-canyon-sunset-walk"');
    else if (!idea.key.startsWith(`${city}/`)) problem("✗", `key must start with "${city}/"`);
    else if (seenKeys.has(idea.key)) problem("✗", "the same key is used twice");
    seenKeys.add(idea.key);
    if (idea.status && !["ready", "draft"].includes(idea.status)) problem("✗", 'status is "ready" or "draft"');

    // What it is
    const title = idea.title?.trim() ?? "";
    if (title.length < 3) problem("✗", "no title");
    else if (title.length > TITLE_MAX) problem("!", `the title is over ${TITLE_MAX} characters`);
    if (title && seenTitles.has(title.toLowerCase())) problem("!", `same title as ${seenTitles.get(title.toLowerCase())}`);
    seenTitles.set(title.toLowerCase(), idea.key);
    const description = idea.description?.trim() ?? "";
    if (!description) problem("✗", "no description");
    else if (description.length < DESCRIPTION_MIN) problem("!", "the description is very short");
    else if (description.length > DESCRIPTION_MAX) problem("!", `the description is over ${DESCRIPTION_MAX} characters`);
    if (!TYPES.includes(idea.type)) problem("✗", `type is one of ${TYPES.join(", ")}`);

    // Where
    if (!["out", "in"].includes(idea.where)) problem("✗", 'where is "out" or "in"');
    const goingOut = idea.where === "out";
    const environment = idea.environment ?? (goingOut ? null : "INDOOR");
    if (!ENVIRONMENTS.includes(environment)) problem("✗", `environment is one of ${ENVIRONMENTS.join(", ")}`);
    let place = null;
    let at = null;
    if (goingOut) {
      place = typeof idea.place === "string" ? places.get(idea.place) : idea.place;
      if (!place) problem("✗", typeof idea.place === "string" ? `no place with id "${idea.place}" in "places"` : "going out needs a place");
      else at = checkPlace(place, problem, center);
    } else if (idea.place) {
      problem("✗", "a stay-in idea has no place (it happens at home)");
    }

    // Cost and time
    if (!has("price")) problem("✗", "no price (per person, 0 if it's free)");
    else if (typeof idea.price !== "number" || idea.price < 0) problem("✗", "price is a number of dollars per person");
    if (!Number.isInteger(idea.minutes) || idea.minutes < 10 || idea.minutes > 720) {
      problem("✗", "minutes is how long it takes, 10 to 720");
    }
    const times = idea.best_time ?? [];
    if (!Array.isArray(times) || times.some((t) => !TIMES.includes(t))) problem("✗", `best_time is a list of ${TIMES.join(", ")}`);
    else if (!times.length) problem("!", "no best_time (counts as any time of day)");

    // When in the year
    let months = null;
    if (idea.months === "any") months = ALL_MONTHS;
    else if (has("months")) {
      if (!Array.isArray(idea.months) || !idea.months.length || idea.months.some((m) => !ALL_MONTHS.includes(m))) {
        problem("✗", 'months is "any" or a list of 1-12');
      } else months = [...new Set(idea.months)].sort((a, b) => a - b);
    }
    const holidays = idea.holidays ?? [];
    if (!Array.isArray(holidays) || holidays.some((h) => !HOLIDAYS.includes(h))) problem("✗", `holidays is a list of ${HOLIDAYS.join(", ")}`);
    if (!has("months") && !holidays.length) problem("!", 'no months (say "any" if it works all year)');

    // How it feels
    if (environment !== "INDOOR") {
      if (!has("weather")) problem("!", `no weather (${WEATHER.join(", ")}); the app guesses from the environment`);
      else if (!WEATHER.includes(idea.weather)) problem("✗", `weather is one of ${WEATHER.join(", ")}`);
    }
    if (!has("feel")) problem("!", "no feel (CALM or UPBEAT)");
    else if (!FEELS.includes(idea.feel)) problem("✗", "feel is CALM or UPBEAT");
    if (!has("exertion")) problem("!", "no exertion (NONE, LIGHT or HARD)");
    else if (!EXERTIONS.includes(idea.exertion)) problem("✗", "exertion is NONE, LIGHT or HARD");

    // Who it's for
    const [minPeople, maxPeople] = idea.people ?? [1, 20];
    if (!Number.isInteger(minPeople) || !Number.isInteger(maxPeople) || minPeople < 1 || maxPeople < minPeople) {
      problem("✗", "people is [fewest, most], like [2, 6]");
    }

    // Tags, safety, links, photos
    const ideaTags = idea.tags ?? [];
    const unknown = ideaTags.filter((t) => !tags.has(t));
    if (unknown.length) problem("✗", `unknown tags: ${unknown.join(", ")} (they are: ${[...tags.keys()].sort().join(", ")})`);
    if (!ideaTags.length) problem("!", "no tags (it'll rarely match a vibe)");
    const risks = idea.risks ?? [];
    if (risks.some((r) => !RISKS.includes(r))) problem("✗", `risks are from ${RISKS.join(", ")}`);
    if (idea.safety_note && idea.safety_note.length > NOTE_MAX) problem("✗", `safety_note is over ${NOTE_MAX} characters`);
    if (idea.url && !/^https?:\/\/\S+$/.test(idea.url)) problem("✗", "url isn't a link");
    const photos = idea.photos ?? [];
    if (!photos.length) problem("!", "no photo (shows the icon tile)");
    for (const photo of photos) {
      if (/^https?:\/\//.test(photo)) continue;
      const path = resolve(dirname(file), photo);
      if (!existsSync(path)) problem("✗", `photo not found: ${photo}`);
      else if (!PHOTO_TYPES[extname(path).toLowerCase()]) problem("✗", `photo isn't a jpg, png or webp: ${photo}`);
      else if (statSync(path).size > PHOTO_MAX_BYTES) problem("!", `${photo} is over ${PHOTO_MAX_BYTES / 1000} KB (resize to ~1200 px wide)`);
    }

    // What it'd save (the same fields the posting form saves)
    const exertion = idea.exertion ?? null;
    const fields = {
      import_key: idea.key,
      title,
      description,
      url: idea.url ?? null,
      modality: goingOut ? "GO_OUT" : "STAY_IN",
      activity_type: idea.type,
      environment,
      weather_needs: environment === "INDOOR" ? null : idea.weather ?? null,
      time_of_day: times.length ? times : null,
      est_price_per_person: idea.price ?? 0,
      est_duration_minutes: idea.minutes,
      is_duration_variable: !!idea.flexible_length,
      feel: idea.feel ?? null,
      exertion,
      months: holidays.length ? null : months,
      holidays,
      min_people: minPeople,
      max_people: maxPeople,
      min_age: idea.min_age ?? 0,
      // Hard work is always labelled strenuous (as in the posting form)
      risk_labels: [...new Set([...risks.filter((r) => r !== "STRENUOUS"), ...(exertion === "HARD" ? ["STRENUOUS"] : [])])].sort(),
      safety_note: idea.safety_note?.trim() || null,
    };
    return {idea, issues, fields, place, at, photos, tags: ideaTags, draft: idea.status === "draft"};
  });
  return {file, city, problems, ideas};
}

// ─── Saving ──────────────────────────────────────────────────────────────────

/** The @venture account: found, or (importing) created */
async function officialAccount() {
  const [found] = await rest(`users?select=user_id&username=eq.${OFFICIAL_USERNAME}`);
  if (found) return found.user_id;
  if (!IMPORT) return null;
  const email = process.env.VENTURE_ACCOUNT_EMAIL || "official@venture-app.invalid";
  const user = await call("/auth/v1/admin/users", {
    method: "POST",
    // No password: nobody signs in as it, the import posts for it
    body: JSON.stringify({email, email_confirm: true, user_metadata: {official: true}}),
  });
  await rest(`users?user_id=eq.${user.id}`, {
    method: "PATCH",
    headers: {Prefer: "return=minimal"},
    body: JSON.stringify({username: OFFICIAL_USERNAME, first_name: "Venture"}),
  });
  console.log(`Created the @${OFFICIAL_USERNAME} account (${email})`);
  return user.id;
}

/** Public places already on Venture, for reuse */
async function loadPlaces() {
  const rows = await rest(
    "venues?select=venue_id,name,coordinates,created_by,opening_hours,activities(visibility)&limit=10000",
  );
  return rows
    .filter((v) => v.created_by == null || (v.activities ?? []).some((a) => a.visibility === "PUBLISHED"))
    .map((v) => ({...v, at: parsePoint(v.coordinates)}))
    .filter((v) => v.at);
}

/** The same place, already on Venture */
const samePlace = (known, place, at) =>
  known
    .map((v) => ({v, meters: milesBetween(v.at, at) * 1609.34, score: nameScore(place.name, v.name)}))
    .filter((c) => c.meters <= SAME_PLACE_METERS && c.score >= SAME_NAME)
    .sort((a, b) => b.score - a.score || a.meters - b.meters)[0]?.v ?? null;

async function savePlace(known, place, at) {
  const existing = samePlace(known, place, at);
  const hours = storedHours(place.hours);
  if (existing) {
    // A listed place without hours gets ours
    if (hours && !existing.opening_hours && existing.created_by == null) {
      await rest(`venues?venue_id=eq.${existing.venue_id}`, {
        method: "PATCH",
        headers: {Prefer: "return=minimal"},
        body: JSON.stringify({opening_hours: hours, hours_checked_at: new Date().toISOString()}),
      });
      existing.opening_hours = hours;
    }
    return {venue_id: existing.venue_id, note: existing.name === place.name ? null : `uses "${existing.name}"`};
  }
  const [created] = await rest("venues?select=venue_id", {
    method: "POST",
    headers: {Prefer: "return=representation"},
    body: JSON.stringify({
      name: place.name.trim(),
      address: place.address?.trim() || null,
      coordinates: `SRID=4326;POINT(${at.lng} ${at.lat})`,
      opening_hours: hours,
      hours_checked_at: hours ? new Date().toISOString() : null,
      access_note: place.access_note?.trim() || null,
      created_by: null, // a listed place: public, nobody's private pin
    }),
  });
  known.push({venue_id: created.venue_id, name: place.name.trim(), created_by: null, opening_hours: hours, at});
  return {venue_id: created.venue_id, note: "new place"};
}

/** Photo links: as they are; local files: uploaded to the ideas' bucket */
async function savePhotos(key, photos, file) {
  const urls = [];
  for (const [i, photo] of photos.entries()) {
    if (/^https?:\/\//.test(photo)) {
      urls.push(photo);
      continue;
    }
    const path = resolve(dirname(file), photo);
    const ext = extname(path).toLowerCase();
    const object = photoUrl(key, photo, i).split("/public/activities/")[1];
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/activities/${object}`, {
      method: "POST",
      headers: headers({"Content-Type": PHOTO_TYPES[ext], "x-upsert": "true", "cache-control": "3600"}),
      body: readFileSync(path),
    });
    if (!res.ok) throw new Error(`uploading ${photo}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    urls.push(`${SUPABASE_URL}/storage/v1/object/public/activities/${object}`);
  }
  return urls;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const numberish = new Set(["est_price_per_person"]);
/** The idea columns the import writes (and compares on a re-run) */
const FIELD_COLUMNS = [
  "title", "description", "url", "modality", "activity_type", "environment", "weather_needs", "time_of_day",
  "est_price_per_person", "est_duration_minutes", "is_duration_variable", "feel", "exertion", "months", "holidays",
  "min_people", "max_people", "min_age", "risk_labels", "safety_note",
];
/** Where a photo ends up: a link as it is, a local file at its upload */
const photoUrl = (key, photo, i) =>
  /^https?:\/\//.test(photo)
    ? photo
    : `${SUPABASE_URL}/storage/v1/object/public/activities/imported/${key.replace(/\//g, "-")}-${i + 1}${extname(photo).toLowerCase()}`;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) or SUPABASE_SECRET_KEY");
  if ((PUBLISH || RETIRE) && !IMPORT) throw new Error("--publish and --retire go with --import");

  const files = ideaFiles();
  if (!files.length) {
    console.log(`No idea files (looked in ${CONTENT_DIR}). See content/ideas/README.md.`);
    return;
  }
  const tagRows = await rest("tags?select=tag_id,name");
  const tags = new Map(tagRows.map((t) => [t.name, t.tag_id]));

  // 1. Check everything
  const checked = files.map((f) => checkFile(f, tags));
  if (CHECK_PHOTOS) {
    for (const {ideas} of checked) {
      for (const {photos, issues} of ideas) {
        for (const photo of photos.filter((p) => /^https?:\/\//.test(p))) {
          const ok = await fetch(photo, {method: "HEAD"}).then((r) => r.ok).catch(() => false);
          if (!ok) issues.push({level: "✗", text: `photo link doesn't load: ${photo}`});
        }
      }
    }
  }

  let errors = 0;
  let ready = 0;
  for (const {file, fatal, problems, ideas} of checked) {
    console.log(`\n${basename(file)}${fatal ? `: ✗ ${fatal}` : ` (${ideas.length} ideas)`}`);
    for (const text of problems ?? []) console.log(`  ✗ ${text}`);
    for (const {idea, issues, draft} of ideas) {
      const bad = issues.some((i) => i.level === "✗");
      if (bad) errors++;
      else if (!draft) ready++;
      if (!issues.length && !draft) continue;
      console.log(`  ${idea.key ?? "(no key)"}${draft ? " [draft]" : ""}`);
      for (const {level, text} of issues) console.log(`    ${level} ${text}`);
    }
  }
  console.log(`\n${ready} ready to import, ${errors} with problems to fix (✗)`);
  if (!IMPORT) {
    if (ready) console.log("Nothing saved. Run with --import to save the ready ones.");
    return;
  }

  // 2. Save what passed
  const officialId = await officialAccount();
  const known = await loadPlaces();
  const existing = await rest(
    `activities?select=idea_id,import_key,user_id,visibility,venue_id,image_urls,${FIELD_COLUMNS.join(",")},activity_tags(tag_id)&import_key=not.is.null&limit=10000`,
  );
  const byKey = new Map(existing.map((row) => [row.import_key, row]));
  const counts = {added: 0, updated: 0, unchanged: 0, failed: 0, retired: 0};

  for (const {file, ideas} of checked) {
    for (const {idea, issues, fields, place, at, photos, tags: ideaTags, draft} of ideas) {
      if (draft || issues.some((i) => i.level === "✗")) continue;
      try {
        const row = byKey.get(idea.key);
        if (row && row.user_id !== officialId) {
          throw new Error(`the key is taken by an idea @${OFFICIAL_USERNAME} didn't post`);
        }
        const venue = place ? await savePlace(known, place, at) : {venue_id: null, note: null};
        const tagIds = ideaTags.map((t) => tags.get(t)).sort((a, b) => a - b);

        if (!row) {
          const image_urls = await savePhotos(idea.key, photos, file);
          const [created] = await rest("activities?select=idea_id", {
            method: "POST",
            headers: {Prefer: "return=representation"},
            body: JSON.stringify({
              ...fields,
              user_id: officialId,
              venue_id: venue.venue_id,
              image_urls,
              visibility: PUBLISH ? "PUBLISHED" : "PENDING_REVIEW",
            }),
          });
          if (tagIds.length) {
            await rest("activity_tags", {
              method: "POST",
              headers: {Prefer: "return=minimal"},
              body: JSON.stringify(tagIds.map((tag_id) => ({idea_id: created.idea_id, tag_id}))),
            });
          }
          counts.added++;
          console.log(`+ ${idea.key}${venue.note ? ` (${venue.note})` : ""}${PUBLISH ? "" : ", in the review queue"}`);
          continue;
        }

        // Already there: only what changed (it keeps its review status)
        const changes = {};
        for (const [k, v] of Object.entries({...fields, venue_id: venue.venue_id})) {
          if (k === "import_key") continue;
          const current =
            numberish.has(k) ? Number(row[k]) : k === "risk_labels" ? [...(row[k] ?? [])].sort() : row[k];
          if (!same(current, v)) changes[k] = v;
        }
        // Photos: uploaded again only when the list in the file changed (a
        // local file edited in place keeps its old upload: rename it)
        if (!same(photos.map((p, i) => photoUrl(idea.key, p, i)), row.image_urls ?? [])) {
          changes.image_urls = await savePhotos(idea.key, photos, file);
        }
        const rowTags = (row.activity_tags ?? []).map((t) => t.tag_id).sort((a, b) => a - b);
        const tagsChanged = !same(rowTags, tagIds);

        if (!Object.keys(changes).length && !tagsChanged) {
          counts.unchanged++;
          continue;
        }
        if (Object.keys(changes).length) {
          await rest(`activities?idea_id=eq.${row.idea_id}`, {
            method: "PATCH",
            headers: {Prefer: "return=minimal"},
            body: JSON.stringify(changes),
          });
        }
        if (tagsChanged) {
          await rest(`activity_tags?idea_id=eq.${row.idea_id}`, {method: "DELETE", headers: {Prefer: "return=minimal"}});
          if (tagIds.length) {
            await rest("activity_tags", {
              method: "POST",
              headers: {Prefer: "return=minimal"},
              body: JSON.stringify(tagIds.map((tag_id) => ({idea_id: row.idea_id, tag_id}))),
            });
          }
        }
        counts.updated++;
        console.log(`~ ${idea.key}: ${[...Object.keys(changes), ...(tagsChanged ? ["tags"] : [])].join(", ")}`);
      } catch (e) {
        counts.failed++;
        console.error(`✗ ${idea.key}: ${e.message}`);
      }
    }
  }

  // 3. @venture ideas in these cities that aren't in the files any more
  const inFiles = new Set(checked.flatMap(({ideas}) => ideas.map(({idea}) => idea.key)));
  const cities = new Set(checked.map(({city}) => city).filter(Boolean));
  const gone = existing.filter(
    (row) =>
      row.user_id === officialId &&
      cities.has(row.import_key.split("/")[0]) &&
      !inFiles.has(row.import_key) &&
      row.visibility !== "PRIVATE",
  );
  for (const row of gone) {
    if (RETIRE) {
      await rest(`activities?idea_id=eq.${row.idea_id}`, {
        method: "PATCH",
        headers: {Prefer: "return=minimal"},
        body: JSON.stringify({visibility: "PRIVATE"}),
      });
      counts.retired++;
      console.log(`- ${row.import_key}: retired (private to @${OFFICIAL_USERNAME})`);
    } else {
      console.log(`? ${row.import_key} isn't in the files any more (--retire hides it)`);
    }
  }
  console.log("\nSaved:", counts);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
