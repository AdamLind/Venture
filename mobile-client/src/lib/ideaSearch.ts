// Searching ideas by what you'd type: "snowboard", "nordic valley", "tacos
// provo". Every word you type has to start a word somewhere in the idea (its
// title, place, address, tags or description), so "snow" finds Snowboarding
// and "nordic val" finds Nordic Valley. Ideas are already on the phone
// (Discover loads them all), so this runs as you type.

type Searchable = {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  activity_tags?: {tags?: {name?: string | null} | null}[] | null;
  venues?: {name?: string | null; address?: string | null} | null;
};

/** Lowercase, no accents, words split on anything that isn't a letter or digit */
const words = (text: string | null | undefined): string[] =>
  (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** The words of a search; none means there's nothing to search for */
export const searchWords = (query: string): string[] => words(query);

const tagNames = (idea: Searchable): string[] =>
  idea.tags ?? (idea.activity_tags ?? []).map((at) => at.tags?.name ?? "").filter(Boolean);

/**
 * How well an idea matches the search (higher is better), or null when it
 * doesn't. A word in the title counts most, then the place and tags, then
 * the address and description.
 */
export function searchScore(idea: Searchable, query: string | string[]): number | null {
  const wanted = typeof query === "string" ? searchWords(query) : query;
  if (!wanted.length) return null;
  const fields: [string[], number][] = [
    [words(idea.title), 4],
    [words(idea.venues?.name), 3],
    [tagNames(idea).flatMap(words), 3],
    [words(idea.venues?.address), 1],
    [words(idea.description), 1],
  ];
  let score = 0;
  for (const word of wanted) {
    let best = 0;
    for (const [fieldWords, weight] of fields) {
      if (weight <= best) continue;
      if (fieldWords.some((w) => w.startsWith(word))) best = weight;
    }
    if (!best) return null;
    score += best;
  }
  return score;
}
