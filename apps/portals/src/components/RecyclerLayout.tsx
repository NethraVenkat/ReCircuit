import React from "react";
import Link from "next/link";
import { RECYCLER_CONFIGS } from "@/lib/config";
import type { RecyclerId } from "@/lib/types";

export function RecyclerLayout({ recyclerId, activePath = "/", children }: { recyclerId: RecyclerId; activePath?: string; children: React.ReactNode }): JSX.Element {
  const config = RECYCLER_CONFIGS[recyclerId];
  const items = [["Overview", config.routes.home], ["Accepted items & rates", config.routes.items], ...(recyclerId === "deccan" ? [["Pickup charges", config.routes.fees]] : []), ["Book a pickup", config.routes.book], ["Track a pickup", config.routes.track], ["Operator console", config.routes.admin]];
  const service = recyclerId === "deccan" ? "Electronics collection · Hyderabad" : recyclerId === "paperplus" ? "Paper collection · Minimum 5 kg" : "Mixed scrap collection · ₹50 pickup fee";
  return <div className={"portal-shell recycler-workspace portal-shell--" + recyclerId}>
    <a className="portal-skip" href="#portal-main">Skip to content</a>
    <header className="recycler-header"><Link href="/" className="recycler-brand"><span aria-hidden="true">♻</span><span>{config.name}<small>{config.location}</small></span></Link><Link href={config.routes.book} className="portal-button">Book a pickup</Link></header>
    <nav className="recycler-nav" aria-label="Recycler navigation">{items.map(([label, href]) => <Link key={href} href={href} aria-current={activePath === href ? "page" : undefined}>{label}</Link>)}</nav>
    <main id="portal-main" className="portal-content recycler-content"><div className="recycler-service"><p>{service}</p><p data-testid={recyclerId === "quickscrap" ? "unregistered-notice" : "cpcb-badge"}>{config.unregisteredNotice || "Registration evidence requires independent verification"}</p></div>{children}</main>
    <footer className="recycler-footer"><span>{config.name} · {config.location}</span><span>{recyclerId === "paperplus" ? "Paper only. No electronics or hazardous materials." : recyclerId === "quickscrap" ? "Hazardous explosives and radioactive waste are prohibited." : "Data-wipe declaration required for laptops and phones."}</span></footer>
  </div>;
}
