// utils/sunset.ts
// Sunset time for a day and place, from the standard "sunrise equation"
// (accurate to a few minutes; checked against Provo, London and Tokyo).
// Used by the plan evaluator's "outside after dark" rule.

const rad = Math.PI / 180;

/** Sunset on `day` (local calendar date) at lat/lng, or null (polar day/night). */
export function sunsetAt(day: Date, latitude: number, longitude: number): Date | null {
  const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  const julianDay = noon.getTime() / 86_400_000 + 2440587.5;
  // Days since 2000-01-01 noon UTC, nudged to this longitude's solar noon
  const n = Math.round(julianDay - 2451545.0 + longitude / 360);
  const jStar = n - longitude / 360;

  const meanAnomaly = (357.5291 + 0.98560028 * jStar) % 360;
  const center =
    1.9148 * Math.sin(meanAnomaly * rad) +
    0.02 * Math.sin(2 * meanAnomaly * rad) +
    0.0003 * Math.sin(3 * meanAnomaly * rad);
  const eclipticLongitude = (meanAnomaly + center + 180 + 102.9372) % 360;
  const solarNoon =
    2451545.0 +
    jStar +
    0.0053 * Math.sin(meanAnomaly * rad) -
    0.0069 * Math.sin(2 * eclipticLongitude * rad);

  const sinDeclination = Math.sin(eclipticLongitude * rad) * Math.sin(23.4397 * rad);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHourAngle =
    (Math.sin(-0.833 * rad) - Math.sin(latitude * rad) * sinDeclination) /
    (Math.cos(latitude * rad) * cosDeclination);
  if (cosHourAngle < -1 || cosHourAngle > 1) return null;

  const hourAngle = Math.acos(cosHourAngle) / rad;
  return new Date((solarNoon + hourAngle / 360 - 2440587.5) * 86_400_000);
}
