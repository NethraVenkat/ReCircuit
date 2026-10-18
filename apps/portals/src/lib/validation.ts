import { SERVICEABLE_PINCODES } from "./types";
import type { BookingItemInput, RecyclerId } from "./types";

export interface ValidationError {
  field: string;
  message: string;
}

export interface BookingSubmissionPayload {
  client_request_id: string;
  full_name: string;
  phone: string;
  address_line: string;
  locality: string;
  pincode: string;
  preferred_slot: string;
  items: BookingItemInput[];
  data_wipe_ack?: boolean | string;
  human_verification_code?: string;
}

/**
 * Validates a booking submission according to site rules and returns any errors.
 */
export function validateBookingSubmission(
  recyclerId: RecyclerId,
  data: BookingSubmissionPayload,
  activeCaptchaCode?: string
): { ok: true } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // 1. Common fields validation
  if (!data.client_request_id || typeof data.client_request_id !== "string" || !data.client_request_id.trim()) {
    errors.push({ field: "client_request_id", message: "Client request ID is required" });
  }

  if (!data.full_name || typeof data.full_name !== "string" || data.full_name.trim().length < 2) {
    errors.push({ field: "full_name", message: "Full name must be at least 2 characters" });
  }

  // 10-digit phone
  const cleanPhone = (data.phone || "").replace(/\D/g, "");
  if (cleanPhone.length !== 10) {
    errors.push({ field: "phone", message: "Phone number must be exactly 10 digits" });
  }

  if (!data.address_line || typeof data.address_line !== "string" || data.address_line.trim().length < 4) {
    errors.push({ field: "address_line", message: "Address line is required" });
  }

  if (!data.locality || typeof data.locality !== "string" || !data.locality.trim()) {
    errors.push({ field: "locality", message: "Locality is required" });
  }

  // Serviceable pincode
  const pincode = (data.pincode || "").trim();
  if (!SERVICEABLE_PINCODES.includes(pincode as (typeof SERVICEABLE_PINCODES)[number])) {
    errors.push({
      field: "pincode",
      message: `Pincode ${pincode || "(empty)"} is outside our serviceable area. Supported Hyderabad pincodes: ${SERVICEABLE_PINCODES.join(", ")}`,
    });
  }

  if (!data.preferred_slot || typeof data.preferred_slot !== "string" || !data.preferred_slot.trim()) {
    errors.push({ field: "preferred_slot", message: "Please select a preferred pickup time slot" });
  }

  // Items validation
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    errors.push({ field: "items", message: "At least one item must be added for pickup" });
  } else {
    // 2. Recycler-specific items and rules validation
    if (recyclerId === "deccan") {
      let hasLaptopOrPhone = false;

      for (const item of data.items) {
        const nameLower = (item.name || "").toLowerCase();

        // Deccan accepts: laptops, desktops, mobile phones, chargers/cables, batteries, small electronics
        // Deccan rejects: paper, cardboard, plastics, glass
        if (
          nameLower.includes("paper") ||
          nameLower.includes("newspaper") ||
          nameLower.includes("cardboard") ||
          nameLower.includes("plastic") ||
          nameLower.includes("glass")
        ) {
          errors.push({
            field: "items",
            message: `Deccan E-Cycle does not accept "${item.name}". Rule: We only collect electronic waste (laptops, phones, chargers, batteries). Paper, cardboard, plastics, and glass are rejected.`,
          });
        }

        if (
          nameLower.includes("laptop") ||
          nameLower.includes("phone") ||
          nameLower.includes("mobile") ||
          nameLower.includes("notebook")
        ) {
          hasLaptopOrPhone = true;
        }
      }

      // Data wipe acknowledgement required if laptop or phone is included
      const ackVal = data.data_wipe_ack === true || data.data_wipe_ack === "true" || data.data_wipe_ack === "on";
      if (hasLaptopOrPhone && !ackVal) {
        errors.push({
          field: "data_wipe_ack",
          message: "Data-wipe acknowledgement is required when submitting laptops or mobile phones for electronic recycling.",
        });
      }
    } else if (recyclerId === "paperplus") {
      let totalKg = 0;

      for (const item of data.items) {
        const nameLower = (item.name || "").toLowerCase();

        // PaperPlus accepts: newspaper, cardboard, books, magazines
        // PaperPlus rejects: batteries, any electronics, plastic
        if (
          nameLower.includes("battery") ||
          nameLower.includes("batteries") ||
          nameLower.includes("electronic") ||
          nameLower.includes("laptop") ||
          nameLower.includes("phone") ||
          nameLower.includes("charger") ||
          nameLower.includes("plastic")
        ) {
          errors.push({
            field: "items",
            message: `PaperPlus Kabadi does not accept "${item.name}". Rule: We only purchase paper scrap (newspaper, cardboard, books, magazines). Batteries, electronics, and plastics are strictly rejected.`,
          });
        }

        const wt = Number(item.weightKg) || 0;
        totalKg += wt;
      }

      // Minimum 5 kg total
      if (totalKg < 5) {
        errors.push({
          field: "items",
          message: `PaperPlus Kabadi requires a minimum pickup weight of 5 kg total. Current total entered: ${totalKg} kg.`,
        });
      }

      // Human verification code check
      const code = (data.human_verification_code || "").trim().toUpperCase();
      if (!code) {
        errors.push({
          field: "human_verification_code",
          message: "Human verification code is required to schedule pickup with PaperPlus Kabadi.",
        });
      } else if (!activeCaptchaCode || code !== activeCaptchaCode.trim().toUpperCase()) {
        errors.push({
          field: "human_verification_code",
          message: "The entered verification code is incorrect. Please check the image and try again.",
        });
      }
    } else if (recyclerId === "quickscrap") {
      // QuickScrap accepts almost everything: electronics, batteries, paper, cardboard, metal, plastic
      for (const item of data.items) {
        const nameLower = (item.name || "").toLowerCase();
        if (nameLower.includes("radioactive") || nameLower.includes("explosive")) {
          errors.push({
            field: "items",
            message: `QuickScrap Hyd cannot handle "${item.name}". Hazardous explosives/radioactive waste is prohibited.`,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

