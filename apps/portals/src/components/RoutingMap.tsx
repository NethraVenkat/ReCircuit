"use client";
import React, { useEffect, useRef, useState } from "react";
import type { SavedProposal } from "../lib/geospatial/service";
/** The gated key is an intended public browser key, never the HeiGIT credential. */
export function RoutingMap({ proposal, configuration }: { proposal: SavedProposal; configuration: { enabled: boolean; key?: string } }) {
  const target = useRef<HTMLDivElement>(null), [requested, setRequested] = useState(false), [error, setError] = useState(""), [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!requested || !configuration.enabled || !configuration.key || !target.current) return;
    let disposed = false, map: import("leaflet").Map | undefined;
    setError(""); setLoaded(false);
    void import("leaflet").then(L => {
      if (disposed || !target.current) return;
      map = L.map(target.current, { scrollWheelZoom: false, keyboard: true });
      const tiles = L.tileLayer("https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=" + encodeURIComponent(configuration.key!), { minZoom: 1, maxZoom: 18, crossOrigin: true, attribution: '<a href="https://www.maptiler.com/copyright/">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' });
      tiles.once("load", () => { if (!disposed) setLoaded(true); });
      tiles.once("tileerror", () => { if (!disposed) { setError("Map tiles unavailable or access/quota refused. Use the labelled schematic and ordered stop list below. No automatic retry."); map?.remove(); map = undefined; } });
      tiles.addTo(map);
      const bounds: [number, number][] = [];
      for (const route of proposal.optimization.solution.routes) {
        const vehicle = proposal.input.vehicles.find(v => v.id === route.vehicleId)!;
        const points = [vehicle.start.coordinate, ...route.pickupIds.map(id => proposal.input.pickups.find(p => p.id === id)!.coordinate), vehicle.end.coordinate];
        const road = proposal.geometry?.find(g => g.vehicleId === route.vehicleId && !g.matrixMismatch);
        const coordinates: [number, number][] = road ? road.geometry.coordinates.map(c => [c[1], c[0]]) : points.map(c => [c.lat, c.lon]);
        bounds.push(...coordinates); L.polyline(coordinates, { color: "#245c3d", weight: 4, ...(road ? {} : { dashArray: "6 6" }) }).addTo(map);
        points.forEach((p, index) => { L.circleMarker([p.lat, p.lon], { radius: index === 0 || index === points.length - 1 ? 5 : 9, color: "#17251c", fillColor: "#fff", fillOpacity: 1 }).bindTooltip(index === 0 ? "Start depot" : index === points.length - 1 ? "Return depot" : "Proposed stop " + index, { permanent: true, direction: "top" }).addTo(map!); });
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 }); else map.setView([0, 0], 1);
    }).catch(() => { if (!disposed) setError("Map renderer unavailable. Use the ordered stop list."); });
    return () => { disposed = true; map?.remove(); };
  }, [requested, configuration.enabled, configuration.key, proposal.id]); // Saved proposal input is immutable.
  if (!configuration.enabled || !configuration.key) return <p>Basemap disabled until provider origin restrictions are verified. The schematic and stop list remain available.</p>;
  return <section aria-label="Optional MapTiler basemap"><p>Road lines require validated provider geometry. Dashed lines show schematic stop order, not driving directions.</p>{!requested ? <button type="button" onClick={() => setRequested(true)}>Load restricted basemap</button> : <><div ref={target} className="routing-map" role="region" aria-label="Interactive planned route map" style={error ? { display: "none" } : undefined}/>{!loaded && !error && <p role="status">Loading map tiles…</p>}{error && <p role="alert">{error}</p>}<a href="https://www.maptiler.com" aria-label="MapTiler maps"><img src="https://api.maptiler.com/resources/logo.svg" width="100" height="30" alt="MapTiler"/></a></>}</section>;
}
