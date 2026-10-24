import React from "react";
import type { SavedProposal } from "../lib/geospatial/service";
import { displayDuration, displayNumber, stopTime } from "../lib/geospatial/presentation";

export function RoutingStopList({ proposal }: { proposal: SavedProposal }) {
  return <aside className="routing-stop-panel" aria-labelledby="ordered-stops-title"><div className="routing-section-heading"><div><p className="routing-eyebrow">Saved proposal</p><h2 id="ordered-stops-title">Ordered stops</h2></div><span className="routing-count">{proposal.optimization.solution.served}</span></div>
    <p className="routing-muted">Proposed sequence only. Requested slots remain preferences.</p>
    {proposal.optimization.solution.routes.map(route => {
      const vehicle = proposal.input.vehicles.find(v => v.id === route.vehicleId)!;
      return <section key={route.vehicleId} className="routing-resource"><h3>{route.vehicleId}</h3><p className="routing-muted">{displayNumber(route.metres / 1000, 3)} km · {displayDuration(route.totalSeconds)} including service</p>
        <ol className="routing-stop-list" aria-label={"Ordered stops for " + route.vehicleId}>{route.stops.map(stop => {
          const pickup = proposal.input.pickups.find(p => p.id === stop.pickupId)!;
          return <li key={stop.pickupId}><strong>{pickup.reference}</strong><dl className="routing-stop-times"><div><dt>Arrival</dt><dd>{stopTime(proposal.input.serviceDate, stop.arrival)}</dd></div><div><dt>Service</dt><dd>{stopTime(proposal.input.serviceDate, stop.serviceStart)}</dd></div><div><dt>Departure</dt><dd>{stopTime(proposal.input.serviceDate, stop.departure)}</dd></div></dl><p>Cumulative load <strong>{displayNumber(stop.loadKg)} kg</strong></p><p className="routing-slot"><span>Requested</span>{pickup.requestedWindow || "Not recorded"}</p><p className="routing-slot"><span>Dispatcher slot</span>{pickup.confirmedWindow ? `${stopTime(proposal.input.serviceDate, pickup.confirmedWindow.start)} – ${stopTime(proposal.input.serviceDate, pickup.confirmedWindow.end)}` : "Not confirmed"}</p></li>;
        })}</ol><details className="routing-resource-details"><summary>Resource & timing details</summary><dl><div><dt>Start depot</dt><dd>{vehicle.start.id}</dd></div><div><dt>Return depot</dt><dd>{vehicle.end.id}</dd></div><div><dt>Capacity / initial load</dt><dd>{displayNumber(vehicle.capacityKg)} kg / {displayNumber(vehicle.initialLoadKg)} kg</dd></div><div><dt>Travel / service / waiting</dt><dd>{displayDuration(route.travelSeconds)} / {displayDuration(route.serviceSeconds)} / {displayDuration(route.waitingSeconds)}</dd></div></dl></details></section>;
    })}
    <div className="routing-unassigned"><h3>Unassigned stops</h3>{proposal.optimization.solution.unassigned.length ? <ul>{proposal.optimization.solution.unassigned.map(p => <li key={p.pickupId}><strong>{p.pickupId}</strong><p>{p.reason}</p></li>)}</ul> : <p className="routing-muted">No unassigned stops in this saved proposal.</p>}</div>
  </aside>;
}
