import React from "react";
import { RecyclerLayout } from "./RecyclerLayout";
export function QuickScrapLayout({ children, activePath = "/" }: { children: React.ReactNode; activePath?: string; failureSwitchActive?: boolean }): JSX.Element {
  return <RecyclerLayout recyclerId="quickscrap" activePath={activePath}>{children}</RecyclerLayout>;
}
