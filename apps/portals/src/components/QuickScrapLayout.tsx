import React from "react";
import Link from "next/link";
import { RECYCLER_CONFIGS } from "@/lib/config";

interface QuickScrapLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

export function QuickScrapLayout({ children, activePath = "/" }: QuickScrapLayoutProps): JSX.Element {
  const config = RECYCLER_CONFIGS.quickscrap;

  const navItems = [
    { label: "Home", href: config.routes.home },
    { label: "Rates", href: config.routes.items },
    { label: "Quick Pickup", href: config.routes.book },
    { label: "Track Order", href: config.routes.track },
    { label: "Admin Portal", href: config.routes.admin },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-mono text-sm selection:bg-orange-600 selection:text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
        {/* Notice Banner */}
        <div className="bg-orange-950/80 border-b border-orange-800/80 text-orange-300 px-6 py-2 text-xs flex justify-between items-center">
          <span data-testid="unregistered-notice" className="font-bold">
            ⚠️ {config.unregisteredNotice}
          </span>
          <span className="text-[11px] text-orange-400">Aggregator Service · Flat Pickup Fee ₹199</span>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="bg-orange-600 text-white px-2 py-0.5 rounded font-black text-base">QS</span>
            <div>
              <h1 className="font-bold text-lg text-white tracking-wider uppercase">QuickScrap Hyd</h1>
              <p className="text-[10px] text-slate-400">On-demand scrap & electronics pickup aggregator</p>
            </div>
          </div>

          {/* Navigation */}
          <nav data-testid="quickscrap-nav" className="flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = activePath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all ${
                    isActive
                      ? "bg-orange-600 text-white"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6">{children}</main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-500 py-6 text-center text-xs">
        <p className="text-slate-400">QuickScrap Hyd Aggregator — Synthetic Demo Data for Hackathon 2026</p>
        <p className="text-[11px] mt-1 text-slate-600">
          Independent third-party aggregator. State regulatory status: in-progress.
        </p>
      </footer>
    </div>
  );
}

