import React from "react";
export function DemoBanner(): React.JSX.Element | null {
  if (process.env.RECIRCUIT_DEMO_MODE !== "true" || process.env.RECIRCUIT_PERSISTENCE !== "local" || process.env.NODE_ENV === "production") return null;
  return <aside className="demo-workspace-banner" aria-label="Demo provenance">Demo workspace — fictional records<details><summary>About these records</summary><p>Fictional households and vehicles at public test locations. Verification and travel costs are simulated. No real bookings or external provider calls.</p></details></aside>;
}
