import type { RecyclerId } from "./types";

export interface RecyclerRateEntry {
  item: string;
  payout: string;
  fee: string;
}

export interface RecyclerRates {
  acceptedCategories: string[];
  rejectedCategories: string[];
  acceptedSummary: string;
  rejectedSummary: string;
  minWeightKg: number;
  freeThresholdKg?: number;
  underWeightFeeInr?: number;
  payoutDescription: string;
  rulesSummary: string;
  rateCard: RecyclerRateEntry[];
}

export interface RecyclerMeta {
  id: RecyclerId;
  name: string;
  tagline: string;
  location: string;
  refPrefix: string;
  badge?: string;
  unregisteredNotice?: string;
  primaryColor: string;
  rates: RecyclerRates;
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
    rates: {
      acceptedCategories: [
        "Laptops",
        "Desktops",
        "Mobile phones",
        "Chargers & cables",
        "Household batteries",
        "Small electronics",
      ],
      rejectedCategories: ["Paper", "Cardboard", "Plastics", "Glass", "Domestic municipal waste"],
      acceptedSummary:
        "We accept laptops, desktops, mobile phones, chargers, and household batteries with certified safe disposal.",
      rejectedSummary:
        "Notice: We strictly reject paper, cardboard, plastics, and domestic municipal waste. Bookings containing rejected materials will be cancelled upon arrival.",
      minWeightKg: 0,
      freeThresholdKg: 5,
      underWeightFeeInr: 180,
      payoutDescription:
        "Free pickup for 5 kg or more. ₹180 fee for under 5 kg. Payouts up to ₹250 for dead laptops.",
      rulesSummary:
        "CPCB certified e-waste recycler. Data-wipe destruction declaration required for laptops and phones. Free doorstep collection above 5 kg.",
      rateCard: [
        { item: "Laptops (dead or working)", payout: "Up to ₹250 / unit", fee: "₹0" },
        { item: "Mobile phones & tablets", payout: "Up to ₹50 / unit", fee: "₹0" },
        { item: "Miscellaneous electronic waste", payout: "₹0", fee: "₹0" },
        { item: "Pickup under 5 kg total weight", payout: "N/A", fee: "₹180 door fee" },
      ],
    },
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
    rates: {
      acceptedCategories: [
        "Newspaper (Raddi)",
        "Corrugated Cardboard",
        "Old Books & Office Paper",
        "Magazines",
      ],
      rejectedCategories: ["Batteries", "Electronics", "Plastics", "Hazardous chemicals"],
      acceptedSummary:
        "We purchase newspaper, corrugated cardboard boxes, old books, and magazines.",
      rejectedSummary:
        "We strictly reject batteries, electronics, plastics, and hazardous waste. Human verification (CAPTCHA) required.",
      minWeightKg: 5,
      underWeightFeeInr: 0,
      payoutDescription:
        "Doorstep scrap collection across Hyderabad. We weigh with certified electronic scales and pay instant cash!",
      rulesSummary:
        "Minimum 5 kg total scrap weight required. We pay instant cash. No electronics or batteries accepted. Human verification (CAPTCHA) required.",
      rateCard: [
        { item: "Newspaper (Raddi)", payout: "₹12 / kg", fee: "₹0" },
        { item: "Corrugated Cardboard", payout: "₹9 / kg", fee: "₹0" },
        { item: "Old Books & Office Paper", payout: "₹10 / kg", fee: "₹0" },
        { item: "Magazines", payout: "₹7 / kg", fee: "₹0" },
      ],
    },
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
    rates: {
      acceptedCategories: ["Electronics", "Batteries", "Paper", "Metal", "Plastic"],
      rejectedCategories: ["Hazardous explosives", "Radioactive waste"],
      acceptedSummary: "All household scrap: electronics, raddi, appliances, metals, plastics.",
      rejectedSummary: "Hazardous explosives and radioactive waste are prohibited.",
      minWeightKg: 0,
      payoutDescription:
        "Doorstep scrap aggregator. All items accepted with flat ₹50 service fee.",
      rulesSummary:
        "All scrap accepted. Flat ₹50 convenience fee per pickup. Registration: application in process.",
      rateCard: [
        { item: "Mixed electronics & e-waste", payout: "₹10 - ₹200 / unit", fee: "₹50 service fee" },
        { item: "Paper / Raddi / Cardboard", payout: "₹8 / kg", fee: "₹50 service fee" },
        { item: "Old household appliances", payout: "₹50 - ₹500", fee: "₹50 service fee" },
      ],
    },
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
  let cleanPath = pathname;
  const m = cleanPath.match(/^\/portal\/[^/]+(\/.*)?$/);
  if (m) cleanPath = m[1] || "/";
  const routingPage = ["/admin/routing", "/admin/routing/preparation", "/admin/routing/fleet", "/admin/routing/proposals"].includes(cleanPath)
    || /^\/admin\/routing\/proposals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanPath);
  return Boolean(allowed && (allowed.includes(cleanPath) || routingPage));
}

/**
 * Generates the preferred slot options: next 3 days x 2 windows (10:00–12:00, 15:00–17:00 IST).
 * Uses explicit Asia/Kolkata timezone calculations.
 */
export function getAvailableSlots(baseDate = new Date()): string[] {
  const slots: string[] = [];
  const windows = ["10:00–12:00 IST", "15:00–17:00 IST"];

  for (let i = 1; i <= 3; i++) {
    const target = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(target);
    for (const w of windows) {
      slots.push(`${dateStr} (${w})`);
    }
  }
  return slots;
}

/**
 * Generates a 5-digit booking reference string with the given prefix.
 */
export function generateReference(prefix: string): string {
  const digits = Math.floor(10000 + Math.random() * 90000);
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

