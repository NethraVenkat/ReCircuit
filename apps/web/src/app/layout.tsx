import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReCircuit — Autonomous Reverse-Logistics Agent",
  description: "E-Waste & Recycling Pickup Coordinator with verifiable human-in-the-loop approvals.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
                  ⚡
                </span>
                <span className="text-xl font-bold tracking-tight text-slate-900">
                  ReCircuit
                </span>
              </Link>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                Agentic AI 2026
              </span>
            </div>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link
                href="/"
                className="text-slate-600 hover:text-emerald-600 transition-colors"
              >
                Household Intake
              </Link>
              <Link
                href="/test-cases"
                className="px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                Official Test Cases
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <p>
            ReCircuit Autonomous Reverse-Logistics Coordinator · Powered by Ziro.Digital Hackathon 2026
          </p>
          <p className="mt-1">
            Deterministic Routing · Dual-Session Verifier · Zero Auto-Collection Invariant
          </p>
        </footer>
      </body>
    </html>
  );
}
