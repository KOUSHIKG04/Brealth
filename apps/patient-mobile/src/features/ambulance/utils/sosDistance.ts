type Point = { latitude: number; longitude: number };

export function sosDistanceLabel(from: Point | null, to: Point | null) {
  if (!from || !to) return null;
  const radians = Math.PI / 180;
  const dLat = (to.latitude - from.latitude) * radians;
  const dLng = (to.longitude - from.longitude) * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.latitude * radians) *
      Math.cos(to.latitude * radians) *
      Math.sin(dLng / 2) ** 2;
  const metres = 12742000 * Math.asin(Math.min(1, Math.sqrt(a)));
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}
