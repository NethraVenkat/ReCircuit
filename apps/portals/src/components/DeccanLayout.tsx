import React from "react";
import Link from "next/link";
import { RECYCLER_CONFIGS } from "@/lib/config";

interface DeccanLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  failureSwitchActive?: boolean;
}

export function DeccanLayout({ children, activePath = "/" }: DeccanLayoutProps): JSX.Element {
  const config = RECYCLER_CONFIGS.deccan;

  const navItems = [
    { label: "Home Overview", href: config.routes.home },
    { label: "Accepted E-Waste", href: config.routes.items },
    { label: "Pickup Charges & Payouts", href: config.routes.fees },
    { label: "Book E-Waste Pickup", href: config.routes.book },
    { label: "Track Booking", href: config.routes.track },
    { label: "Admin Console", href: config.routes.admin },
  ];

  return (
    <div className="portal-shell portal-shell--deccan flex min-h-screen bg-slate-50 text-slate-900">
      <a className="portal-skip" href="#portal-main">Skip to content</a>
      {/* Left Sidebar */}
      <aside
        data-testid="deccan-sidebar"
        className="portal-sidebar w-64 bg-emerald-900 text-emerald-50 flex flex-col shrink-0 border-r border-emerald-950 shadow-lg"
      >
        <div className="p-6 border-b border-emerald-800">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">♻️</span>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-wide text-white">Deccan E-Cycle</h1>
              <p className="text-xs text-emerald-300 font-medium tracking-wider uppercase">Govt Reg. Hyderabad</p>
            </div>
          </div>
        </div>

        {/* CPCB Badge */}
        <div className="p-4 mx-3 my-3 bg-emerald-950/60 border border-emerald-700/50 rounded-sm text-xs text-emerald-200">
          <span data-testid="cpcb-badge" className="font-semibold block text-emerald-300 mb-1">
            Official Compliance Badge:
          </span>
          {config.badge}
        </div>

        {/* Sidebar Nav */}
        <nav aria-label="Recycler navigation" className="portal-nav flex-1 px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = activePath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "text-emerald-100 hover:bg-emerald-800 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-emerald-800 text-xs text-emerald-400">
          <p className="font-medium text-emerald-300">Deccan E-Cycle Facilities</p>
          <p>Sanath Nagar & Kukatpally, Hyd</p>
          <p className="mt-1">Helpline: +91 40 2300 0000</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main id="portal-main" className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="portal-top-header bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Certified E-Waste Reverse Logistics Facility · Operational Zone: Hyderabad
          </div>
          <Link
            href={config.routes.book}
            className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-xs"
          >
            Schedule Pickup
          </Link>
        </header>
        <div className="portal-content p-8 max-w-5xl w-full">{children}</div>
      </main>
    </div>
  );
}

