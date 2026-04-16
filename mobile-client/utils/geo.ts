import {Activity, UserPrefs} from "@/types/itinerary";

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

export const getDistance = (
  location1: UserPrefs | Activity,
  location2: Activity,
): number => {
  // 1. Safe Extraction using Type Guards
  let lat1: number, lon1: number;

  if ("currentLocation" in location1 && location1.currentLocation) {
    // It's UserPrefs
    lat1 = Number(location1.currentLocation.latitude);
    lon1 = Number(location1.currentLocation.longitude);
  } else {
    // It's an Activity (or we assume it has top-level lats)
    lat1 = Number((location1 as Activity).latitude);
    lon1 = Number((location1 as Activity).longitude);
  }

  const lat2 = Number(location2?.latitude);
  const lon2 = Number(location2?.longitude);

  // 2. The "NaN" Prevention Check
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    console.warn("One or more latitudes/longitudes are NaN. Check to see if user location is missing.")
    return 999;
  }

  // ... rest of your Haversine math remains the same
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
