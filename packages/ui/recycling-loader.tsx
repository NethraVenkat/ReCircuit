import React from "react";

/** A read or pending operation; callers render errors separately and retain saved content. */
export function RecyclingLoader({ label = "Loading your pickups…" }: { label?: string }): JSX.Element {
  return <div className="ui-recycling-loader" role="status" aria-busy="true"><svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 12 6-9 8 13M27 15l5 1 2-6M36 21l8 13H28m4-5-4 5 4 5M21 34H5l8-14m-1 6 1-6 6 1"/></g></svg><p>{label}</p></div>;
}
