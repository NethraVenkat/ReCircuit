import "leaflet/dist/leaflet.css";
import type { Metadata } from "next";
import "./globals.css";
import "../../../../packages/ui/theme.css";
import { DemoBanner } from "../../../../packages/ui/demo-banner";

export const metadata: Metadata = {
  title: "Recycler Portal - ReCircuit",
  description: "Mock Recycler Websites for Reverse Logistics Agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased"><DemoBanner/>{children}</body>
    </html>
  );
}

