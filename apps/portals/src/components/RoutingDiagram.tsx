import React from "react";
import type { SavedProposal } from "../lib/geospatial/service";

export function RoutingDiagram({ proposal }: { proposal: SavedProposal }) {
  const nodes = proposal.input.matrix.nodes, geometry = (proposal.geometry || []).filter(g => !g.matrixMismatch);
  const coordinates = [...nodes.map(n => [n.coordinate.lon, n.coordinate.lat]), ...geometry.flatMap(g => g.geometry.coordinates)];
  if (!coordinates.length) return <p>No route coordinates are available. The ordered stop list remains available.</p>;
  const lons = coordinates.map(c => c[0]!), lats = coordinates.map(c => c[1]!), minLon = Math.min(...lons), minLat = Math.min(...lats), lonSpan = Math.max(...lons) - minLon, latSpan = Math.max(...lats) - minLat;
  const point = (lon: number, lat: number) => `${lonSpan ? 30 + (lon - minLon) / lonSpan * 540 : 300},${latSpan ? 180 - (lat - minLat) / latSpan * 160 : 100}`;
  const nodePoint = (id: string) => { const node = nodes.find(n => n.id === id)!; return point(node.coordinate.lon, node.coordinate.lat); };
  return <figure className="routing-diagram"><svg viewBox="0 0 600 200" role="img" aria-label={geometry.length ? "Provider road geometry with numbered proposed stops" : "Schematic proposed stop order. Straight dashed connectors are not driving directions."}>{proposal.optimization.solution.routes.map(route => {
    const vehicle = proposal.input.vehicles.find(v => v.id === route.vehicleId)!, road = geometry.find(g => g.vehicleId === route.vehicleId);
    return <g key={route.vehicleId}><polyline points={road ? road.geometry.coordinates.map(c => point(c[0], c[1])).join(" ") : [vehicle.start.id, ...route.pickupIds, vehicle.end.id].map(nodePoint).join(" ")} fill="none" stroke="#245c3d" strokeWidth="3" strokeDasharray={road ? undefined : "8 5"}/>{route.pickupIds.map((id, i) => {
      const [x, y] = nodePoint(id).split(",");
      return <g key={id}><circle cx={x} cy={y} r="13" fill="#245c3d"/><text x={x} y={Number(y) + 4} textAnchor="middle" fill="white" fontSize="13">{i + 1}</text></g>;
    })}</g>;
  })}</svg><figcaption>{geometry.length ? [...new Set(geometry.map(g => g.attribution))].join(" · ") : "Schematic only: dashed connectors are not driving directions."} This diagram does not load map tiles.</figcaption></figure>;
}
