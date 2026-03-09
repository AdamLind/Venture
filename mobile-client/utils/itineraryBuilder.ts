import {UserPrefs} from "@/types/itinerary";

const API_HOST = process.env.EXPO_PUBLIC_API_HOST;

const scoreAnchors = ({
  allAnchors,
  prefs,
}: {
  allAnchors: any[];
  prefs: UserPrefs;
}) => {
  if (!allAnchors || allAnchors.length === 0) return null;

  const scoredAnchors = allAnchors.map((anchor) => {
    let score = 50; // Base score

    // 1. Vibe Check (Crucial for "Phase")
    // If the vibe matches exactly, give it a massive boost.
    if (anchor.tags?.includes(prefs.vibe)) {
      score += 40;
    }

    // 2. The Budget "Sweet Spot"
    // We want activities close to the budget, not just under it.
    // Inside selectBestAnchor map function:
    const anchorPrice = Number(anchor.est_price_per_person) || 0;
    const budgetPerPerson =
      Number(prefs.budget) / (Number(prefs.headCount) || 2);

    const priceDiff = Math.abs(anchorPrice - budgetPerPerson);
    score -= priceDiff * 2;

    return {...anchor, score};
  });

  // 3. Sort by the highest score and take the winner
  const sorted = scoredAnchors.sort((a, b) => b.score - a.score);
  return sorted;
};

export const queryAnchors = async (
  prefs: UserPrefs,
  isRetry = false,
): Promise<any> => {
  try {
    const response = await fetch(`${API_HOST}/api/ideas/anchors`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(prefs),
    });

    const data = await response.json(); // This is the raw array from the server

    // 1. IF NO RESULTS FOUND (The "Phase" Fallback)
    if ((!data || data.length === 0) && !isRetry) {
      console.log("No specific matches found. Retrying...");

      const broaderPrefs = {
        ...prefs,
        vibe: null,
        travelDistance: prefs.travelDistance * 2,
      };

      // STOP HERE: Return the result of the second call directly
      return await queryAnchors(broaderPrefs, true);
    }

    // 2. DATA PROCESSING
    // Ensure we have an array. If the server returned an error object, fallback to []
    const rawArray = Array.isArray(data) ? data : [];

    const selected = scoreAnchors({allAnchors: rawArray, prefs});

    // 3. FINAL RETURN
    return {
      success: true,
      data: selected, // This is your scored and sorted array
      retried: isRetry
    };
  } catch (error) {
    console.error("Fetch Error:", error);
    return {success: false, error};
  }
};

export const scheduleFillers = async (
  prefs: UserPrefs,
  minutes: number,
  budget: number,
) => {
  const budgetPerPerson = budget / prefs.headCount;

  try {
    const response = await fetch(
      `${API_HOST}/api/ideas/fill-schedule?vibe=cozy&budget=${budgetPerPerson}&type=${prefs.locationType}&minutes=${minutes}`,
    );
    const data = await response.json();
    return data;
  } catch (error) {
    return {success: false, error};
  }
};
