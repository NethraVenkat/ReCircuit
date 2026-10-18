import type { Metadata } from "next";
import "./globals.css";

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
      <body className="min-h-screen bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}

