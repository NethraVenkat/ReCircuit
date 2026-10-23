"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function HouseholdNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Main navigation"><Link href="/" aria-current={pathname === "/" ? "page" : undefined}>My pickups</Link><Link href="/arrange" aria-current={pathname === "/arrange" ? "page" : undefined}>Arrange a pickup</Link><details className="rc-menu"><summary>Help</summary><div><p>Review your items and costs before any booking is submitted.</p><p>This service currently connects to simulated recycler websites.</p><Link href="/test-cases" aria-current={pathname === "/test-cases" ? "page" : undefined}>Examples &amp; reviewer tools</Link></div></details></nav>;
}
