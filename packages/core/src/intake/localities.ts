/**
 * packages/core/src/intake/localities.ts
 *
 * Demo locality lookup (synthetic demo data, Hyderabad only).
 * Maps locality names to pincodes and validates serviceability within Hyderabad.
 */

export interface LocalityInfo {
  locality: string;
  pincode: string;
  city: "Hyderabad";
  state: "Telangana";
}

export const HYDERABAD_LOCALITIES: Record<string, LocalityInfo> = {
  kukatpally: {
    locality: "Kukatpally",
    pincode: "500072",
    city: "Hyderabad",
    state: "Telangana",
  },
  kphb: {
    locality: "KPHB",
    pincode: "500085",
    city: "Hyderabad",
    state: "Telangana",
  },
  sanathnagar: {
    locality: "Sanathnagar",
    pincode: "500018",
    city: "Hyderabad",
    state: "Telangana",
  },
  gachibowli: {
    locality: "Gachibowli",
    pincode: "500032",
    city: "Hyderabad",
    state: "Telangana",
  },
  madhapur: {
    locality: "Madhapur",
    pincode: "500081",
    city: "Hyderabad",
    state: "Telangana",
  },
};

export const HYDERABAD_PINCODES: Record<string, LocalityInfo> = {
  "500072": HYDERABAD_LOCALITIES.kukatpally!,
  "500085": HYDERABAD_LOCALITIES.kphb!,
  "500018": HYDERABAD_LOCALITIES.sanathnagar!,
  "500032": HYDERABAD_LOCALITIES.gachibowli!,
  "500081": HYDERABAD_LOCALITIES.madhapur!,
};

/**
 * Attempts to match a locality name or 6-digit pincode in Hyderabad.
 */
export function lookupLocality(input: string): LocalityInfo | null {
  const cleaned = input.toLowerCase().trim().replace(/[^a-z0-9]/g, "");

  const pinInfo = HYDERABAD_PINCODES[cleaned];
  if (pinInfo) {
    return pinInfo;
  }

  // Match locality name
  for (const [key, info] of Object.entries(HYDERABAD_LOCALITIES)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return info;
    }
  }

  return null;
}
