export const getBoundingBox = (
  lat: number,
  lon: number,
  radiusMiles: number,
) => {
  const milesPerLat = 69;

  // 1. Latitude Delta is easy (always ~69 miles per degree)
  const latDelta = radiusMiles / milesPerLat;

  // 2. Longitude Delta requires a "Correction Factor" for the Earth's curve
  // We use the Cosine of the latitude to see how "squished" the lines are.
  const latInRadians = (lat * Math.PI) / 180;
  const milesPerLon = milesPerLat * Math.cos(latInRadians);
  const lonDelta = radiusMiles / milesPerLon;

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
};

// 1. Define a generic shape that catches EVERYTHING (Prefs, Activities, Builder, etc.)
type Locatable = {
  latitude?: number | null;
  longitude?: number | null;
  currentLocation?: {latitude: number; longitude: number} | null;
};

export const getDistance = (
  location1: Locatable,
  location2: Locatable,
): number => {
  // 2. Safe Extraction: Fallback to the object itself if currentLocation doesn't exist
  const coords1 = location1.currentLocation || location1;
  const coords2 = location2.currentLocation || location2;

  // 3. The Strict Null/Undefined Check (Fixes the Africa bug)
  // Using == null checks for BOTH undefined and null instantly
  if (
    coords1.latitude == null ||
    coords1.longitude == null ||
    coords2.latitude == null ||
    coords2.longitude == null
  ) {
    console.warn("Missing coordinates detected. Skipping distance math.");
    return 999;
  }

  // Now we safely have numbers
  const lat1 = coords1.latitude;
  const lon1 = coords1.longitude;
  const lat2 = coords2.latitude;
  const lon2 = coords2.longitude;

  // ... Haversine math remains identical!
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
