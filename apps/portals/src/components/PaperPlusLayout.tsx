import React from "react";
import Link from "next/link";
import { RECYCLER_CONFIGS } from "@/lib/config";

interface PaperPlusLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

export function PaperPlusLayout({ children, activePath = "/" }: PaperPlusLayoutProps): JSX.Element {
  const config = RECYCLER_CONFIGS.paperplus;

  const navItems = [
    { label: "Home", href: config.routes.home },
    { label: "What We Take & Rates", href: config.routes.items },
    { label: "Schedule Pickup", href: config.routes.book },
    { label: "Check Status", href: config.routes.track },
    { label: "Admin Console", href: config.routes.admin },
  ];

  return (
    <div className="min-h-screen bg-amber-50/40 text-amber-950 flex flex-col">
      {/* Top Banner */}
      <div className="bg-amber-600 text-amber-50 px-6 py-2 text-xs flex justify-between items-center font-medium">
        <span>Hyderabad Paper & Scrap Buyers · Kukatpally / KPHB / Madhapur</span>
        <span data-testid="cpcb-badge" className="bg-amber-700/80 px-2.5 py-0.5 rounded text-[11px]">
          {config.badge}
        </span>
      </div>

      {/* Header and Branding */}
      <header className="bg-white border-b border-amber-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 text-white font-black flex items-center justify-center text-xl shadow">
              PP
            </div>
            <div>
              <h1 className="text-2xl font-black text-amber-900 tracking-tight">PaperPlus Kabadi</h1>
              <p className="text-xs text-amber-700 font-medium">Top Cash for Old Newspapers, Books & Cardboard</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-amber-800 font-bold block">Doorstep Weighing & Cash on Spot</span>
            <span className="text-sm text-amber-950 font-black">Min 5 kg Pickup</span>
          </div>
        </div>

        {/* Top Tab Bar */}
        <nav data-testid="paperplus-topbar" className="bg-amber-100/70 border-t border-amber-200 px-6">
          <div className="max-w-6xl mx-auto flex space-x-2">
            {navItems.map((item) => {
              const isActive = activePath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-5 py-3 text-sm font-bold border-b-2 transition-all ${
                    isActive
                      ? "border-amber-700 text-amber-900 bg-amber-200/60"
                      : "border-transparent text-amber-800 hover:text-amber-950 hover:bg-amber-200/40"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>

      {/* Footer */}
      <footer className="bg-amber-900 text-amber-100 py-6 text-center text-xs border-t border-amber-800 mt-12">
        <p className="font-semibold text-amber-200">PaperPlus Kabadi Service - Kukatpally, Hyderabad</p>
        <p className="mt-1 text-amber-300">We accept paper scrap only. No electronics or hazardous materials.</p>
      </footer>
    </div>
  );
}

