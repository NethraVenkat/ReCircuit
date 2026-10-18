import type { RecyclerId } from "./types";

export interface RecyclerMeta {
  id: RecyclerId;
  name: string;
  tagline: string;
  location: string;
  refPrefix: string;
  badge?: string;
  unregisteredNotice?: string;
  primaryColor: string;
  routes: {
    home: string;
    items: string;
    fees: string;
    book: string;
    confirmation: string;
    track: string;
    admin: string;
  };
}

export const RECYCLER_CONFIGS: Record<RecyclerId, RecyclerMeta> = {
  deccan: {
    id: "deccan",
    name: "Deccan E-Cycle",
    tagline: "Certified Government-Registered E-Waste Recycling Center",
    location: "Hyderabad, Telangana",
    refPrefix: "DEC",
    badge: "Found in CPCB registered recycler list (snapshot 01 Oct 2026, synthetic demo data)",
    primaryColor: "green",
    routes: {
      home: "/",
      items: "/accepted-items",
      fees: "/pickup-charges",
      book: "/book-pickup",
      confirmation: "/book-pickup/confirmation",
      track: "/track",
      admin: "/admin",
    },
  },
  paperplus: {
    id: "paperplus",
    name: "PaperPlus Kabadi",
    tagline: "Hyderabad's Trusted Paper & Scrap Collector — Best Rates Guaranteed",
    location: "Kukatpally, Hyderabad",
    refPrefix: "PPK",
    badge: "Found in CPCB registered recycler list (snapshot 01 Oct 2026, synthetic demo data)",
    primaryColor: "amber",
    routes: {
      home: "/",
      items: "/what-we-take",
      fees: "/what-we-take#rates",
      book: "/schedule",
      confirmation: "/schedule/done",
      track: "/status",
      admin: "/admin",
    },
  },
  quickscrap: {
    id: "quickscrap",
    name: "QuickScrap Hyd",
    tagline: "All-in-One Instant Scrap & Electronics Pickup Aggregator",
    location: "Hyderabad & Secunderabad",
    refPrefix: "QSH",
    unregisteredNotice: "Registration: application in process",
    primaryColor: "slate",
    routes: {
      home: "/",
      items: "/rates",
      fees: "/rates",
      book: "/pickup",
      confirmation: "/pickup/thanks",
      track: "/track-order",
      admin: "/admin",
    },
  },
};

/**
 * Allowed routes per recycler. Used to return 404 for routes belonging to another recycler.
 */
export const RECYCLER_ALLOWED_ROUTES: Record<RecyclerId, string[]> = {
  deccan: [
    "/",
    "/accepted-items",
    "/pickup-charges",
    "/book-pickup",
    "/book-pickup/confirmation",
    "/track",
    "/admin",
  ],
  paperplus: [
    "/",
    "/what-we-take",
    "/schedule",
    "/schedule/done",
    "/status",
    "/admin",
  ],
  quickscrap: [
    "/",
    "/rates",
    "/pickup",
    "/pickup/thanks",
    "/track-order",
    "/admin",
  ],
};

export function isRouteAllowedForRecycler(pathname: string, recyclerId: RecyclerId): boolean {
  const allowed = RECYCLER_ALLOWED_ROUTES[recyclerId];
  return Boolean(allowed && allowed.includes(pathname));
}

/**
 * Generates the preferred slot options: next 3 days x 2 windows (10:00–12:00, 15:00–17:00 IST).
 */
export function getAvailableSlots(baseDate = new Date()): string[] {
  const slots: string[] = [];
  const windows = ["10:00–12:00 IST", "15:00–17:00 IST"];

  for (let i = 1; i <= 3; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD
    for (const w of windows) {
      slots.push(`${dateStr} (${w})`);
    }
  }
  return slots;
}

/**
 * Generates a unique 5-digit booking reference string with the given prefix.
 */
export function generateReference(prefix: string): string {
  const digits = Math.floor(10000 + Math.random() * 90000); // 10000 to 99999
  return `${prefix}-${digits}`;
}

/**
 * Resolves the active RecyclerId from environment or host header.
 * In production, RECYCLER_ID is strictly required (no fallback, throws error).
 * In development, falling back to Host/port mapping is permitted.
 */
export function resolveRecyclerId(headerHost?: string | null): RecyclerId {
  const envId = process.env.RECYCLER_ID;
  if (envId === "deccan" || envId === "paperplus" || envId === "quickscrap") {
    return envId;
  }

  // In production, RECYCLER_ID is strictly required!
  if (process.env.NODE_ENV === "production") {
    throw new Error("CONFIGURATION_ERROR_MISSING_RECYCLER_ID");
  }

  // Development fallback to host / port mapping
  if (headerHost) {
    if (headerHost.includes("3101") || headerHost.includes("deccan")) return "deccan";
    if (headerHost.includes("3102") || headerHost.includes("paperplus")) return "paperplus";
    if (headerHost.includes("3103") || headerHost.includes("quickscrap")) return "quickscrap";
  }

  return "deccan";
}

