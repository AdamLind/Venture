// supabase/functions/unsplash/index.ts
// Unsplash photos for the official ideas, picked by admins in the app (the
// idea page's "Pick a photo", components/ideas/PhotoPickerSheet.tsx).
//
// The Unsplash key lives here (a Supabase secret, UNSPLASH_ACCESS_KEY), never
// in the app: Unsplash's rules, and anyone could take it out of the app.
// Only admins may call it (it spends our hourly Unsplash limit).
//
//   {action: "search", query, page}  → a page of photos
//   {action: "use", photo}           → tells Unsplash the photo is used (its
//                                      rule), and returns its link and credit.
//                                      One request: the photo is the one from
//                                      the search (only admins get here, and
//                                      they may edit these ideas anyway)
//
// Saving it on the idea is the app's own update, so the database's rules
// decide who may change which idea ("Admins edit official ideas").
//
// Deploy: npx supabase functions deploy unsplash
// (verify_jwt is off in config.toml: with the new API keys the function
// checks the caller itself, below)

import {createClient} from "jsr:@supabase/supabase-js@2";

const UNSPLASH_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
/** The publishable key (new API keys), or the legacy anon key */
function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch {
    // (fall back below)
  }
  return Deno.env.get("SUPABASE_ANON_KEY")!;
}

const PER_PAGE = 12;

type Photo = {
  id: string;
  /** ~400 px wide, for the grid */
  thumb: string;
  /** ~1080 px wide, for the preview */
  regular: string;
  /** The link the idea keeps (sized by the app; keeps Unsplash's ixid) */
  raw: string;
  /** Where using it is reported (Unsplash's download_location) */
  download: string;
  /** Its page on Unsplash */
  page: string;
  about: string;
  name: string;
  username: string;
};

/** One call to the function: what Unsplash last said is left this hour */
type Call = {remaining: number | null};

async function unsplash(call: Call, path: string) {
  const res = await fetch(`https://api.unsplash.com${path}`, {
    headers: {Authorization: `Client-ID ${UNSPLASH_KEY}`, "Accept-Version": "v1"},
  });
  // (Unsplash caches searches for a day: a cached answer doesn't count, and
  // its number is from when it was first made, so only a fresh one says)
  const cached = /hit/i.test(res.headers.get("x-cache") ?? "") || Number(res.headers.get("age")) > 0;
  const left = res.headers.get("x-ratelimit-remaining");
  if (left !== null && !cached) call.remaining = Number(left);
  if (!res.ok) {
    if (call.remaining === 0 || res.status === 429) {
      call.remaining = 0;
      throw new Failure(429, "Unsplash's hourly limit is used up. Try again within the hour.");
    }
    throw new Failure(502, `Unsplash said ${res.status}`);
  }
  return res.json();
}

// deno-lint-ignore no-explicit-any
const toPhoto = (p: any): Photo => ({
  id: p.id,
  thumb: p.urls.small,
  regular: p.urls.regular,
  raw: p.urls.raw,
  download: p.links.download_location,
  page: p.links.html,
  about: [p.description, p.alt_description].filter(Boolean).join(" · "),
  name: p.user.name,
  username: p.user.username,
});

class Failure extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The answer, with what's left this hour when Unsplash said (errors too) */
const reply = (call: Call, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({...body, remaining: call.remaining}), {
    status,
    headers: {"Content-Type": "application/json"},
  });

Deno.serve(async (req) => {
  const call: Call = {remaining: null};
  try {
    if (req.method !== "POST") throw new Failure(405, "POST only");

    // Only admins (as the caller, so the staff table's own rules apply)
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Failure(401, "Sign in first");
    const db = createClient(SUPABASE_URL, publishableKey(), {
      global: {headers: {Authorization: auth}},
      auth: {persistSession: false},
    });
    const {data: who} = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!who?.user) throw new Failure(401, "Sign in first");
    const {data: staff} = await db.from("staff").select("role").eq("user_id", who.user.id).maybeSingle();
    if (staff?.role !== "ADMIN") throw new Failure(403, "Admins only");
    if (!UNSPLASH_KEY) throw new Failure(500, "The Unsplash key isn't set on the server yet");

    const body = await req.json().catch(() => ({}));

    if (body.action === "search") {
      const query = String(body.query ?? "").trim().slice(0, 100);
      if (!query) throw new Failure(400, "Nothing to search for");
      const page = Math.max(1, Math.min(50, Number(body.page) || 1));
      const q = new URLSearchParams({query, page: String(page), per_page: String(PER_PAGE), content_filter: "high"});
      const data = await unsplash(call, `/search/photos?${q}`);
      return reply(call, 200, {photos: data.results.map(toPhoto), total: data.total, pages: data.total_pages});
    }

    if (body.action === "use") {
      const p = body.photo ?? {};
      const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
      const id = text(p.id, 40);
      const raw = text(p.raw, 600);
      const name = text(p.name, 120);
      const username = text(p.username, 60);
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !raw || !name || !username) {
        throw new Failure(400, "Not an Unsplash photo");
      }
      // Its links must be Unsplash's, for this photo
      let download: URL;
      try {
        download = new URL(String(p.download));
        if (!raw.startsWith("https://images.unsplash.com/")) throw new Error();
      } catch {
        throw new Failure(400, "Not an Unsplash photo");
      }
      if (download.origin !== "https://api.unsplash.com" || download.pathname !== `/photos/${id}/download`) {
        throw new Failure(400, "Not an Unsplash photo");
      }
      // Unsplash's rule: using a photo counts as a download
      await unsplash(call, download.pathname + download.search);
      return reply(call, 200, {url: raw, credit: {source: "unsplash", photo_id: id, name, username}});
    }

    throw new Failure(400, "Unknown action");
  } catch (e) {
    const status = e instanceof Failure ? e.status : 500;
    return reply(call, status, {error: e instanceof Error ? e.message : String(e)});
  }
});
