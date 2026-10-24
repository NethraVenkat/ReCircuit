import React from "react";
import { RecyclerLayout } from "./RecyclerLayout";
export function PaperPlusLayout({ children, activePath = "/" }: { children: React.ReactNode; activePath?: string; failureSwitchActive?: boolean }): JSX.Element {
  return <RecyclerLayout recyclerId="paperplus" activePath={activePath}>{children}</RecyclerLayout>;
}
