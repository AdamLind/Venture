// src/lib/random.ts
// Seeded randomness: the same seed always gives the same order, so a list
// can be shuffled once and stay put until we deliberately pick a new seed.

/** A new random 32-bit seed. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/** mulberry32: a tiny, fast PRNG. Returns numbers in [0, 1). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle driven by `seed`. Returns a new array.
 * Sort the input consistently first (e.g. by id) so the same seed gives the
 * same order no matter what order the items arrived in.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = items.slice();
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
