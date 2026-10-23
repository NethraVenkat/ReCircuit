/** Sanity-check snapped road vertices against requested order; not a road-network proof. */
export function geometryFollowsOrder(vertices: [number, number][], stops: Array<{ lon: number; lat: number }>, maxSnapMetres = 350): boolean {
  if (vertices.length < 2 || stops.length < 2) return false;
  const distance = (a: [number, number], b: { lon: number; lat: number }) => {
    const radians = Math.PI / 180, lat = (a[1] - b.lat) * radians, lon = (a[0] - b.lon) * radians;
    const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b.lat * radians) * Math.sin(lon / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  };
  if (distance(vertices[0]!, stops[0]!) > maxSnapMetres || distance(vertices.at(-1)!, stops.at(-1)!) > maxSnapMetres) return false;
  let previous = 0;
  for (const stop of stops.slice(1, -1)) {
    let nearest = -1, metres = Infinity;
    for (let i = 0; i < vertices.length; i++) { const d = distance(vertices[i]!, stop); if (d < metres) { metres = d; nearest = i; } }
    if (metres > maxSnapMetres || nearest < previous) return false; previous = nearest;
  }
  return true;
}
