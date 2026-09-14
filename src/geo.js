// Returns the distance in meters between two lat/lng points, using the
// Haversine formula (accurate enough for geofencing at this scale — it
// doesn't need to account for Earth's slight ellipsoid shape).
function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { distanceMeters };
