import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "../../../../packages/ui/theme.css";
import { HouseholdNavigation } from "../components/household-navigation";
export const metadata: Metadata = { title: "ReCircuit | Household pickups", description: "Arrange a recycling pickup, review the costs and follow your booking." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><a className="rc-skip" href="#main">Skip to content</a><header className="rc-header"><div className="rc-header-inner"><Link className="rc-brand" href="/" aria-label="ReCircuit home"><svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#245C3D"/><path d="M22 11a8 8 0 1 0 1 9M22 6v6h-6" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>ReCircuit</Link><HouseholdNavigation/></div></header><main id="main" className="rc-workspace">{children}</main><footer className="rc-footer"><span>Thoughtful recycling. Clear next steps.</span><span>ReCircuit household collection service</span></footer></body></html>;
}
