import { RecyclingLoader } from "../../../../../../packages/ui/recycling-loader";
import React, { Suspense } from "react";
import { RoutingWorkspace } from "../../../components/routing/Workspace";
import "./workspace.css";
import { currentServiceDate } from "../../../lib/geospatial/navigation";
// Render service-date context per request; authentication remains client memory only.
export const dynamic = "force-dynamic";
export default function RoutingLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="routing-workspace"><RecyclingLoader label="Preparing routing navigation..."/></main>}><RoutingWorkspace initialServiceDate={currentServiceDate()}>{children}</RoutingWorkspace></Suspense>;
}
