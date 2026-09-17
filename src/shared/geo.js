export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pickBestHospital(hospitals, point) {
  if (!hospitals.length) return null;

  const withDistance = hospitals.map((h) => ({
    ...h,
    distanceKm: haversineKm(h, point),
  }));

  const withCapacity = withDistance.filter((h) => (h.availableBeds ?? 0) > 0);
  const pool = withCapacity.length > 0 ? withCapacity : withDistance;

  return pool.reduce((best, h) => (h.distanceKm < best.distanceKm ? h : best));
}

// A point `distanceKm` away from `point`, in a random bearing — used to seed
// a simulated ambulance's starting position a plausible distance out.
export function offsetPointRandomDirection(point, minKm, maxKm) {
  const R = 6371;
  const distanceKm = minKm + Math.random() * (maxKm - minKm);
  const bearing = Math.random() * 2 * Math.PI;

  const lat1 = (point.latitude * Math.PI) / 180;
  const lon1 = (point.longitude * Math.PI) / 180;
  const angularDistance = distanceKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (lon2 * 180) / Math.PI,
  };
}

// Simple linear interpolation in lat/lng space, `t` fraction of the way from
// `from` to `to` (0 = stay put, 1 = arrive exactly). Fine at the few-km scale
// this is used at — no need for great-circle interpolation.
export function lerpPoint(from, to, t) {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
  };
}
