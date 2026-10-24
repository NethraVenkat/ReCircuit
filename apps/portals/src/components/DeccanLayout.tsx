import React from "react";
import { RecyclerLayout } from "./RecyclerLayout";
export function DeccanLayout({ children, activePath = "/" }: { children: React.ReactNode; activePath?: string; failureSwitchActive?: boolean }): JSX.Element {
  return <RecyclerLayout recyclerId="deccan" activePath={activePath}>{children}</RecyclerLayout>;
}
