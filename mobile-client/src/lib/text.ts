// src/lib/text.ts
// Tidying names people type, without changing what they meant. Only the
// obvious slips are fixed (a whole title in CAPS or all lowercase); names
// written on purpose ("McDonald's", "iFly", "BYU Creamery") stay as typed.

/** Two or more words, all one case: a slip, not a style */
const isOneCase = (text: string) =>
  /[a-z]/i.test(text) && /\s/.test(text) && (text === text.toUpperCase() || text === text.toLowerCase());

/** An idea's title: "SUNSET HIKE TO THE OVERLOOK" → "Sunset hike to the overlook" */
export function tidyTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!isOneCase(t)) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** A place's name (a proper noun): "hidden falls trailhead" → "Hidden Falls Trailhead" */
export function tidyPlaceName(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!isOneCase(t)) return t;
  return t.toLowerCase().replace(/(^|[\s(/-])(\S)/g, (_, gap: string, c: string) => gap + c.toUpperCase());
}

/** A count in a small badge: "7", "99", then "99+" (a bigger number won't fit) */
export const badgeCount = (n: number): string => (n > 99 ? "99+" : String(n));
