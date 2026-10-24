import React, { Suspense } from "react";
import { RoutingWorkspace } from "../../../components/routing/Workspace";
import "./workspace.css";
// Render service-date context per request; authentication remains client memory only.
export const dynamic = "force-dynamic";
export default function RoutingLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="routing-workspace"><p role="status">Preparing routing navigation…</p></main>}><RoutingWorkspace>{children}</RoutingWorkspace></Suspense>;
}
