export const getBoundingBox = (lat: number, lon: number, radiusMiles: number) => {
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

export const getDistance = () => ({lat1, lon1, lat2, lon2} : {lat1: number, lon1: number, lat2: number, lon2: number}) => {
    const toRad = (value : number) => (value * Math.PI) / 180;
    const R = 3959; // Earth's radius in miles

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}