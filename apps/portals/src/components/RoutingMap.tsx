"use client";
import React, { useEffect, useRef, useState } from "react";
import type { SavedProposal } from "../lib/geospatial/service";
import { RoutingDiagram } from "./RoutingDiagram";

/** MapTiler is an explicitly gated public browser key; HeiGIT remains server-only. */
export function RoutingMap({ proposal, configuration }: { proposal: SavedProposal; configuration: { enabled: boolean; key?: string } }) {
  const target = useRef<HTMLDivElement>(null), [requested, setRequested] = useState(false), [error, setError] = useState(""), [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0);
  const available = configuration.enabled && !!configuration.key;
  useEffect(() => {
    if (!requested || !configuration.enabled || !configuration.key || !target.current) return;
    let disposed = false, failed = false, map: import("leaflet").Map | undefined, resize: ResizeObserver | undefined;
    void import("leaflet").then(L => {
      if (disposed || !target.current) return;
      map = L.map(target.current, { scrollWheelZoom: false, keyboard: true });
      const tiles = L.tileLayer("https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=" + encodeURIComponent(configuration.key!), { minZoom: 1, maxZoom: 18, crossOrigin: true, attribution: '<a href="https://www.maptiler.com/copyright/">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' });
      tiles.once("load", () => { if (!disposed && !failed) setLoaded(true); });
      tiles.once("tileerror", () => {
        if (!disposed) { failed = true; setError("Map tiles unavailable or access/quota refused. No automatic retry."); map?.remove(); map = undefined; }
      });
      tiles.addTo(map);
      const bounds: [number, number][] = [];
      for (const route of proposal.optimization.solution.routes) {
        const vehicle = proposal.input.vehicles.find(v => v.id === route.vehicleId)!;
        const points = [vehicle.start.coordinate, ...route.pickupIds.map(id => proposal.input.pickups.find(p => p.id === id)!.coordinate), vehicle.end.coordinate];
        const road = proposal.geometry?.find(g => g.vehicleId === route.vehicleId && !g.matrixMismatch);
        const coordinates: [number, number][] = road ? road.geometry.coordinates.map(c => [c[1], c[0]]) : points.map(c => [c.lat, c.lon]);
        bounds.push(...coordinates); L.polyline(coordinates, { color: "#245c3d", weight: 4, ...(road ? {} : { dashArray: "6 6" }) }).addTo(map);
        const roundTrip = vehicle.start.coordinate.lat === vehicle.end.coordinate.lat && vehicle.start.coordinate.lon === vehicle.end.coordinate.lon;
        points.forEach((p, index) => {
          if (roundTrip && index === points.length - 1) return;
          const depot = index === 0 || index === points.length - 1;
          if (depot) L.circleMarker([p.lat, p.lon], { radius: 6, color: "#17251c", fillColor: "#fff", fillOpacity: 1 }).bindTooltip(index === 0 ? roundTrip ? "Start & return depot" : "Start depot" : "Return depot", { permanent: true, direction: "top" }).addTo(map!);
          else L.marker([p.lat, p.lon], { title: "Proposed stop " + index, icon: L.divIcon({ className: "routing-number-marker", html: `<span>${index}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).bindTooltip("Proposed stop " + index).addTo(map!);
        });
      }
      const fit = () => { if (bounds.length) map?.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }); else map?.setView([0, 0], 1); };
      fit();
      // Refit when the workspace column changes size, including desktop → mobile.
      // Panning and zoom controls do not resize the container or reset the view.
      resize = new ResizeObserver(() => {
        const element = target.current;
        // Route transitions can deliver a final resize before passive cleanup.
        // A detached/zero-size map must not refit and request another tile.
        if (!disposed && map && element?.isConnected && element.clientWidth > 0 && element.clientHeight > 0) { map.invalidateSize({ pan: false }); fit(); }
      });
      resize.observe(target.current);
    }).catch(() => { if (!disposed) { map?.remove(); setError("Map renderer unavailable. No automatic retry."); } });
    return () => { disposed = true; resize?.disconnect(); map?.remove(); };
  }, [requested, configuration.enabled, configuration.key, proposal.id, attempt]);

  function requestMap() { setError(""); setLoaded(false); setRequested(true); setAttempt(value => value + 1); }
  return <section className="routing-visualization" aria-label="Route map">
    <div className="routing-map-toolbar"><span className="routing-map-label">Route map</span><span className="routing-muted">{error ? "Tile-free fallback" : loaded ? "MapTiler basemap" : "Ordered stops work without tiles"}</span></div>
    {error ? <div className="routing-map-error" role="alert"><strong>Basemap could not load</strong><p>The route diagram is open below. Your ordered stop list is still available.</p><details><summary>Map connection details</summary><p>{error}</p></details><button type="button" className="routing-button routing-button--secondary" onClick={requestMap}>Retry basemap</button></div> : requested && available ? <div className="routing-map-stage"><div ref={target} className="routing-map" role="region" aria-label="Interactive planned route map"/>{!loaded && <p className="routing-map-loading" role="status">Loading map tiles…</p>}</div> : <div className="routing-map-placeholder"><svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><path d="m6 12 12-5 12 5 12-5v29l-12 5-12-5-12 5Z M18 7v29 M30 12v29" fill="none" stroke="currentColor" strokeWidth="2"/></svg><h3>{available ? "Explore the proposed route" : "Basemap is not available"}</h3><p>{available ? "Load the interactive map to inspect numbered stops and the saved route." : "Provider access is disabled or its origin restrictions have not been verified. Use the diagram or ordered stops."}</p>{available && <button type="button" className="routing-button" onClick={requestMap}>Load interactive map</button>}</div>}
    {requested && available && !error && <div className="routing-map-credit"><a href="https://www.maptiler.com" aria-label="MapTiler maps"><img src="https://api.maptiler.com/resources/logo.svg" width="84" height="25" alt="MapTiler"/></a><span>Solid lines: validated road geometry. Dashed lines: schematic order.</span></div>}
    {!!proposal.geometry?.length && <p className="routing-road-credit">{[...new Set(proposal.geometry.map(road => road.attribution))].join(" · ")}</p>}
    {proposal.geometry?.some(road => road.matrixMismatch) && <p className="routing-notice" role="status">Road geometry differs materially from the matrix. The map uses schematic stop order for that route; review provider assumptions.</p>}
    {proposal.geometryError && <p className="routing-notice" role="status">Road geometry is unavailable. The map and diagram use schematic stop order.</p>}
    <details className="routing-diagram-disclosure" open={error ? true : undefined}><summary>View route diagram</summary><RoutingDiagram proposal={proposal}/></details>
  </section>;
}
