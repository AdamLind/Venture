// src/lib/commons.ts
// Photos of real places from Wikimedia Commons, for the photo picker's "Near
// this place" (components/ideas/PhotoPickerSheet.tsx): photos taken near the
// place's pin, or found by words. Free, no key and no hourly limit, so the
// picker starts here for places (Unsplash's searches are limited).
//
// Only freely licensed photos (CC0, public domain, CC BY, CC BY-SA): they may
// be used with credit, which the idea page shows (PhotoCredit: the
// photographer, linking to the photo's page, and the licence, linking to it).
// Shown from Wikimedia (its standard thumbnail sizes), never copied.

import type { CommonsCredit } from "@/src/lib/images";

const API = "https://commons.wikimedia.org/w/api.php";
/** Wikimedia asks apps to say who they are (no personal details) */
const HEADERS = { "Api-User-Agent": "date-ideas-app/1.0 (photo picker)" };
const LIMIT = 30;
/** The size the idea keeps (a standard thumbnail width; sizedImage picks smaller ones) */
const KEEP_WIDTH = 1280;

export type CommonsPhoto = {
  /** "File:Rock Canyon Park (42821926692).jpg" */
  file: string;
  /** ~500 px wide, for the grid */
  thumb: string;
  /** The link the idea keeps (1280 px wide, or the original if smaller) */
  url: string;
  /** Its page on Commons */
  page: string;
  /** The photographer, as plain text (null: not given) */
  name: string | null;
  license: string;
  licenseUrl: string | null;
  about: string;
  /** Meters from the pin (nearby searches) */
  meters: number | null;
  /** Commons notes the people in it have rights too ("personality rights") */
  peopleWarning: boolean;
  /** Its place in a search by words (best match first) */
  rank: number;
};

/** Licences that allow use with credit (no GFDL-only, no "fair use") */
const FREE = /^(cc0|cc[- ]zero|public domain|pd\b|pd-|cc by(-sa)? \d)/i;

/** HTML (the photographer can be a link) to plain text */
function plain(html: string | undefined): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A thumbnail link at another standard width */
const atWidth = (thumb: string, width: number) =>
  thumb.replace(/\/\d+px-/, `/${width}px-`);
/** Without Wikimedia's tracking tags */
const bare = (url: string) => url.split("?")[0];

function toPhoto(page: any): CommonsPhoto | null {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime))
    return null;
  const meta = info.extmetadata ?? {};
  const license = plain(meta.LicenseShortName?.value);
  if (!FREE.test(license)) return null;
  const thumb = bare(info.thumburl);
  return {
    file: page.title,
    thumb,
    url: info.width > KEEP_WIDTH ? atWidth(thumb, KEEP_WIDTH) : bare(info.url),
    page: info.descriptionurl,
    name: plain(meta.Artist?.value).slice(0, 120) || null,
    license,
    licenseUrl: meta.LicenseUrl?.value || null,
    about: plain(meta.ImageDescription?.value).slice(0, 300),
    meters: page.coordinates?.[0]?.dist ?? null,
    peopleWarning: /personality/i.test(meta.Restrictions?.value ?? ""),
    rank: page.index ?? 0,
  };
}

async function query(params: Record<string, string>): Promise<CommonsPhoto[]> {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo|coordinates",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "500",
    iiextmetadatafilter:
      "Artist|LicenseShortName|LicenseUrl|ImageDescription|Restrictions",
    ...params,
  });
  const res = await fetch(`${API}?${q}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Wikimedia Commons said ${res.status}`);
  const data = await res.json();
  const pages: any[] = data.query?.pages ?? [];
  return pages.map(toPhoto).filter((p): p is CommonsPhoto => !!p);
}

/** Photos taken within `meters` of a pin, nearest first */
export async function commonsNear(
  latitude: number,
  longitude: number,
  meters: number,
) {
  const at = `${latitude}|${longitude}`;
  const photos = await query({
    generator: "geosearch",
    ggsnamespace: "6",
    ggscoord: at,
    ggsradius: String(Math.min(10000, Math.max(10, Math.round(meters)))),
    ggslimit: String(LIMIT),
    codistancefrompoint: at,
  });
  return photos.sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
}

/** Photos found by words (photos only, best matches first) */
export async function commonsSearch(words: string) {
  const q = new URLSearchParams({
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${words} filetype:bitmap`,
    gsrlimit: String(LIMIT),
  });
  const photos = await query(Object.fromEntries(q));
  return photos.sort((a, b) => a.rank - b.rank);
}

/** The credit the idea keeps for a Commons photo */
export const commonsCredit = (photo: CommonsPhoto): CommonsCredit => ({
  source: "wikimedia",
  file: photo.file,
  name: photo.name,
  license: photo.license,
  license_url: photo.licenseUrl,
});
