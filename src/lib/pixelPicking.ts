import type { PixelGeometry } from './types';

interface MapProjection {
  project(lngLat: [number, number]): { x: number; y: number };
  unproject(point: [number, number]): { lng: number; lat: number };
}

/** Nearest pixel centre within a CSS-pixel tolerance, using the actual map transform. */
export function nearestPixelIndex(
  geometry: Pick<PixelGeometry, 'lon' | 'lat'>,
  point: [number, number],
  map: MapProjection,
  radius = 5,
): number {
  const [x, y] = point;
  const corners = [
    map.unproject([x - radius, y - radius]), map.unproject([x + radius, y - radius]),
    map.unproject([x - radius, y + radius]), map.unproject([x + radius, y + radius]),
  ];
  const west = Math.min(...corners.map((p) => p.lng));
  const east = Math.max(...corners.map((p) => p.lng));
  const south = Math.min(...corners.map((p) => p.lat));
  const north = Math.max(...corners.map((p) => p.lat));
  const centre = (west + east) / 2;
  let nearest = -1;
  let distance = radius * radius;
  for (let i = 0; i < geometry.lon.length; i++) {
    const lat = geometry.lat[i];
    const lon = geometry.lon[i] + 360 * Math.round((centre - geometry.lon[i]) / 360);
    if (lon < west || lon > east || lat < south || lat > north) continue;
    const screen = map.project([lon, lat]);
    const d = (screen.x - x) ** 2 + (screen.y - y) ** 2;
    if (d <= distance) { nearest = i; distance = d; }
  }
  return nearest;
}
