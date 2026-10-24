import React from "react";
export function DemoBanner(): React.JSX.Element | null {
  if (process.env.RECIRCUIT_DEMO_MODE !== "true" || process.env.RECIRCUIT_PERSISTENCE !== "local" || process.env.NODE_ENV === "production") return null;
  return <nav className="workspace-context" aria-label="Workspace information"><a href="/about-workspace">About this workspace</a></nav>;
}

export function WorkspaceExplanation(): React.JSX.Element {
  return <section className="workspace-explanation"><h1>About this workspace</h1><p>This local workspace contains sample households, businesses, bookings and collection scenarios. They represent invented people and activities, not real customer orders or completed trips.</p><h2>Locations and calculations</h2><p>Location markers use public park and visitor-site test coordinates, not private homes. Travel costs are simulated estimates, not retrieved road distances or measured journeys. No live-provider success, fuel use or environmental savings is claimed.</p><h2>Evidence and safeguards</h2><p>Sample verification and operational events are marked as simulated in record details and exported data. Ordinary independent verification rejects simulated evidence. Acceptance and pickup fees use the implemented recycler rules. Scheduling, tenant ownership, preparation checks and evidence expiry remain active.</p><p>Browsing and seeding do not contact external providers. Older datasets and evidence remain separate.</p><a href="/">Return to workspace</a></section>;
}
