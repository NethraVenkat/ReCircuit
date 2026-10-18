/**
 * packages/core/src/intake/post-processor.ts
 *
 * Deterministic post-processing (the safety layer):
 * - Normalizes currency and unit strings; number words.
 * - Anti-hallucination cross-check: any feeCapInr or user weight returned by LLM must appear in the original user text.
 * - Enforces canonical taxonomy and weight defaults.
 * - Detects out-of-city locations (Hyderabad only).
 * - Flags missing paper weights.
 * - Stable UUID generation in TypeScript (never LLM).
 */

import { randomUUID } from "crypto";
import type {
  LlmProposedIntake,
  IntakeItem,
  IntakeClarification,
  ValidatedIntakeResult,
} from "./schema.js";
import { getTaxonomyEntry, GROUP_TO_ITEM_CATEGORY, type TaxonomyCategory } from "./taxonomy.js";
import { lookupLocality } from "./localities.js";
import { transitionState } from "../state-machine.js";
import type { Request as DomainRequest, HazardClass } from "../types.js";

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
  pair: 2,
};

/**
 * Checks if a fee appears in a valid currency / budget context in user text.
 * Prevents cross-domain hallucination (e.g. "8 kg newspaper and 150 cap" -> 8 is not a fee).
 */
export function feeAppearsInCurrencyContext(fee: number, text: string): boolean {
  const lower = text.toLowerCase();

  if (fee === 0) {
    const freeRegex = /\b(?:free(?:\s+only|\s+pickup|\s+of\s+cost)?|no\s+fee|zero\s+(?:fee|cost)|₹\s*0|rs\.?\s*0|0\s*(?:rs|rupees|inr))\b/i;
    return freeRegex.test(lower);
  }

  // 1. Direct currency symbols/abbreviations: ₹150, ₹ 150, rs 150, rs. 150, 150 rupees, 150 inr, 150 rs
  const directCurrency = new RegExp(
    `(?:₹|rs\\.?|inr)\\s*${fee}\\b|\\b${fee}\\s*(?:₹|rs\\.?|inr|rupees|bucks)`,
    "i"
  );
  if (directCurrency.test(lower)) {
    return true;
  }

  // 2. Budget/cap/fee words before amount:
  // "max 150", "max fee 150", "budget 150", "cap 150", "cap of 150", "limit 150",
  // "under 150", "within 150", "not more than 150", "don't charge me more than 150", "upto 150", "up to 150"
  const prefixCap = new RegExp(
    `\\b(?:max(?:imum)?(?:\\s+fee)?|budget(?:\\s+for\\s+pickup(?:\\s+fees?)?)?(?:\\s+is)?|cap(?:\\s+of)?|limit(?:\\s+of)?|under|within|not\\s+more\\s+than|don'?t\\s+charge(?:\\s+me)?(?:\\s+more\\s+than)?|up\\s*to|upto)\\s+(?:of\\s+)?(?:₹|rs\\.?|inr)?\\s*${fee}\\b`,
    "i"
  );
  if (prefixCap.test(lower)) {
    return true;
  }

  // 3. Suffix cap/budget words: "150 max", "150 cap", "150 budget", "150 limit"
  const suffixCap = new RegExp(
    `\\b${fee}\\s*(?:₹|rs\\.?|inr|rupees)?\\s*(?:max|maximum|cap|budget|limit)\\b`,
    "i"
  );
  if (suffixCap.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Checks if a weight value appears in a valid weight context (e.g. "8 kg", "about 8 kg").
 * Prevents cross-domain hallucination (e.g. "8 kg newspaper and 150 cap" -> 150 is not a weight).
 */
export function weightAppearsInWeightContext(weight: number, text: string): boolean {
  const lower = text.toLowerCase();
  const weightUnits = "(?:kg|kgs|kilo|kilos|kilogram|kilograms|grams?|gms?)";

  const regex = new RegExp(`\\b${weight}\\s*${weightUnits}\\b`, "i");
  if (regex.test(lower)) {
    return true;
  }

  const approxRegex = new RegExp(
    `\\b(?:about|approx(?:imately)?|around)\\s*${weight}\\s*${weightUnits}\\b`,
    "i"
  );
  if (approxRegex.test(lower)) {
    return true;
  }

  const weightDesc = new RegExp(`\\b(?:weighs?|weight(?:\\s+of)?)\\s*${weight}\\b`, "i");
  if (weightDesc.test(lower)) {
    return true;
  }

  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (num === weight) {
      if (new RegExp(`\\b${word}\\s*${weightUnits}\\b`, "i").test(lower)) {
        return true;
      }
    }
  }

  if (weight === 0.5 && /\bhalf\s*(?:a\s*)?(?:kg|kilo|kilogram)\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Checks if a quantity value appears in a valid quantity context.
 * Prevents 6-digit pincodes (e.g. 500072) or currency (e.g. 150 cap) from being extracted as quantities.
 */
export function quantityAppearsInQuantityContext(
  qty: number,
  text: string,
  itemRawText?: string
): boolean {
  if (qty === 1) {
    return true;
  }

  if (qty >= 1000) {
    return false;
  }

  const lowerText = text.toLowerCase();
  const lowerItem = (itemRawText || "").toLowerCase();

  const notWeightOrMoney = (s: string, val: number | string): boolean => {
    const afterMatch = new RegExp(`\\b${val}\\s*(?:kg|kgs|kilo|kilos|grams?|gms?|₹|rs|rupees|inr|cap|budget)\\b`, "i");
    const beforeMatch = new RegExp(`(?:₹|rs\\.?|inr)\\s*${val}\\b`, "i");
    return !afterMatch.test(s) && !beforeMatch.test(s);
  };

  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (num === qty) {
      if (lowerItem.includes(word) && notWeightOrMoney(lowerItem, word)) {
        return true;
      }
      if (new RegExp(`\\b${word}\\b`, "i").test(lowerText) && notWeightOrMoney(lowerText, word)) {
        return true;
      }
    }
  }

  if (new RegExp(`\\b${qty}\\b`, "i").test(lowerItem) && notWeightOrMoney(lowerItem, qty)) {
    return true;
  }

  if (new RegExp(`\\b${qty}\\s*(?:nos|pcs|pieces|units|items|boxes|sets|pairs|pack|dead|old|used)?\\b`, "i").test(lowerText)) {
    if (notWeightOrMoney(lowerText, qty)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a numeric value appears in the user text, either as digits or as number words.
 */
export function numberAppearsInText(value: number, text: string): boolean {
  const lower = text.toLowerCase();

  const digitRegex = new RegExp(`\\b${value}\\b|₹\\s*${value}|rs\\.?\\s*${value}|inr\\s*${value}`, "i");
  if (digitRegex.test(lower)) {
    return true;
  }

  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (num === value && new RegExp(`\\b${word}\\b`, "i").test(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Deterministically post-processes the proposed LLM intake output.
 */
export function postProcessIntake(
  rawUserText: string,
  proposed: LlmProposedIntake,
  existingRequestId?: string
): ValidatedIntakeResult {
  const requestId = existingRequestId || randomUUID();
  const clarifications: IntakeClarification[] = [];
  const lowerText = rawUserText.toLowerCase();

  // -------------------------------------------------------------------------
  // 1. Anti-hallucination check on feeCapInr
  // -------------------------------------------------------------------------
  let feeCapInr: number | null = null;
  if (typeof proposed.feeCapInr === "number") {
    if (feeAppearsInCurrencyContext(proposed.feeCapInr, rawUserText)) {
      feeCapInr = Math.round(proposed.feeCapInr);
    } else {
      // Discard hallucinated fee cap! Never invent a limit.
      feeCapInr = null;
    }
  } else if (feeAppearsInCurrencyContext(0, rawUserText)) {
    feeCapInr = 0;
  }

  // -------------------------------------------------------------------------
  // 2. Location verification (Hyderabad demo only)
  // -------------------------------------------------------------------------
  const knownOutsideCities = ["bengaluru", "bangalore", "mumbai", "delhi", "chennai", "pune", "kolkata"];
  const mentionsOutsideCity = knownOutsideCities.some((c) => lowerText.includes(c));
  const proposedOutsideCity =
    proposed.location.city && proposed.location.city.toLowerCase() !== "hyderabad";

  let locality = proposed.location.locality;
  let pincode = proposed.location.pincode;
  let city = "Hyderabad";

  // Attempt synthetic locality lookup
  const matchedLocality =
    lookupLocality(rawUserText) ||
    (locality ? lookupLocality(locality) : null) ||
    (pincode ? lookupLocality(pincode) : null);

  if (matchedLocality) {
    locality = matchedLocality.locality;
    pincode = matchedLocality.pincode;
    city = matchedLocality.city;
  }

  if (mentionsOutsideCity || proposedOutsideCity) {
    city = proposed.location.city || "Outside Service Area";
    clarifications.push({
      code: "LOCATION_OUTSIDE_SERVICE_AREA",
      question: `ReRoute currently only operates within Hyderabad (Telangana). We noticed "${city}". Is there a Hyderabad address for pickup?`,
      affectedItemIds: [],
    });
  }

  // -------------------------------------------------------------------------
  // 3. Process items with canonical taxonomy and anti-hallucination checks
  // -------------------------------------------------------------------------
  const items: IntakeItem[] = [];

  for (const propItem of proposed.items) {
    const itemId = randomUUID(); // Deterministic UUID assigned in TypeScript, never LLM
    const confidence = propItem.confidence ?? 1;

    // Check for vague item or low confidence
    const isVague =
      confidence < 0.7 ||
      propItem.category === "other" ||
      propItem.rawText.toLowerCase().includes("mysterious") ||
      propItem.rawText.toLowerCase().includes("junk") ||
      propItem.rawText.toLowerCase().includes("some things");

    const category: TaxonomyCategory = isVague
      ? "other"
      : getTaxonomyEntry(propItem.category).category;

    const taxonomy = getTaxonomyEntry(category);

    // Quantity normalization & anti-hallucination check
    let quantity = propItem.quantity || 1;
    if (quantity > 1 && !quantityAppearsInQuantityContext(quantity, rawUserText, propItem.rawText)) {
      quantity = 1;
    }
    // Cross check number words if quantity was 1 but text has "two", "three", etc.
    for (const [word, val] of Object.entries(NUMBER_WORDS)) {
      if (propItem.rawText.toLowerCase().includes(word) && val > 1) {
        quantity = val;
      }
    }

    // Declared weight anti-hallucination check: weight must appear in weight context
    let declaredWeightKg: number | null = null;
    if (typeof propItem.declaredWeightKg === "number" && propItem.declaredWeightKg > 0) {
      if (weightAppearsInWeightContext(propItem.declaredWeightKg, rawUserText)) {
        declaredWeightKg = propItem.declaredWeightKg;
      }
    }

    // Weight and hazard determination
    let estimatedWeightKg: number | null = null;
    let weightSource: "user_declared" | "estimated" | "unknown" = "unknown";
    const hazardClass = taxonomy.hazardClass;

    if (declaredWeightKg !== null) {
      weightSource = "user_declared";
      estimatedWeightKg = declaredWeightKg;
    } else if (taxonomy.estimatedWeightKg !== null) {
      estimatedWeightKg = Number((taxonomy.estimatedWeightKg * quantity).toFixed(2));
      weightSource = "estimated";
    }

    // Check if paper/cardboard/materials have count but no weight
    if (taxonomy.unitType === "kg" && declaredWeightKg === null) {
      weightSource = "unknown";
      clarifications.push({
        code: "CLARIFY_WEIGHT_PAPER",
        question: `For ${propItem.rawText}, about how many kg or stacks do you have?`,
        affectedItemIds: [itemId],
      });
    }

    // Check if vague item needs clarification
    if (isVague) {
      clarifications.push({
        code: "CLARIFY_ITEM_VAGUE",
        question: `Could you specify what kind of item "${propItem.rawText}" is?`,
        affectedItemIds: [itemId],
      });
    }

    items.push({
      id: itemId,
      rawText: propItem.rawText,
      category,
      subcategory: propItem.subcategory,
      quantity,
      declaredWeightKg,
      estimatedWeightKg,
      weightSource,
      hazardClass,
      confidence,
      notes: propItem.notes,
    });
  }

  // -------------------------------------------------------------------------
  // 4. Request Pipeline State Determination & Evidence
  // -------------------------------------------------------------------------
  const state = clarifications.length > 0 ? "NEEDS_CLARIFICATION" : "ITEMS_PARSED";

  const totalEstimatedWeightKg = items.reduce(
    (sum, it) => sum + (it.estimatedWeightKg || it.declaredWeightKg || 0),
    0
  );

  const evidence =
    state === "ITEMS_PARSED"
      ? {
          type: "items_extracted" as const,
          itemsCount: items.length,
          totalEstimatedWeightKg,
          extractedAt: new Date().toISOString(),
        }
      : undefined;

  return {
    requestId,
    state,
    location: {
      rawText: proposed.location.rawText || rawUserText,
      locality,
      pincode,
      city,
      confidence: proposed.location.confidence ?? 1,
    },
    feeCapInr,
    items,
    clarifications,
    evidence,
  };
}

/**
 * Applies user's answer to an outstanding clarification, resolving it and updating state.
 */
export function applyClarification(
  current: ValidatedIntakeResult,
  clarificationCode: string,
  answer: string
): ValidatedIntakeResult {
  const remainingClarifications = current.clarifications.filter((c: IntakeClarification) => c.code !== clarificationCode);
  const updatedItems = current.items.map((it: IntakeItem) => ({ ...it }));
  let updatedLocation = { ...current.location };

  // 1. Weight clarification for paper / scrap
  if (clarificationCode === "CLARIFY_WEIGHT_PAPER") {
    const match = answer.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos|kilograms)?/i);
    const weightVal = match && match[1] ? parseFloat(match[1]) : 5.0; // fallback default if user gave stacks
    for (const it of updatedItems) {
      if (it.weightSource === "unknown") {
        it.declaredWeightKg = weightVal;
        it.estimatedWeightKg = weightVal;
        it.weightSource = "user_declared";
      }
    }
  }

  // 2. Vague item clarification
  if (clarificationCode === "CLARIFY_ITEM_VAGUE") {
    for (const it of updatedItems) {
      if (it.category === "other") {
        const lowerAnswer = answer.toLowerCase();
        let newCat: TaxonomyCategory = "small_electronics";
        if (lowerAnswer.includes("laptop")) newCat = "laptop";
        else if (lowerAnswer.includes("phone")) newCat = "mobile_phone";
        else if (lowerAnswer.includes("cable") || lowerAnswer.includes("charger")) newCat = "charger_cable";
        else if (lowerAnswer.includes("battery")) newCat = "battery_household";

        const tax = getTaxonomyEntry(newCat);
        it.category = newCat;
        it.hazardClass = tax.hazardClass;
        it.confidence = 1;
        if (tax.estimatedWeightKg) {
          it.estimatedWeightKg = tax.estimatedWeightKg * it.quantity;
          it.weightSource = "estimated";
        }
      }
    }
  }

  // 3. Location clarification
  if (clarificationCode === "LOCATION_OUTSIDE_SERVICE_AREA") {
    const matched = lookupLocality(answer);
    if (matched) {
      updatedLocation = {
        ...updatedLocation,
        locality: matched.locality,
        pincode: matched.pincode,
        city: matched.city,
      };
    } else {
      updatedLocation = {
        ...updatedLocation,
        city: "Hyderabad",
      };
    }
  }

  const newState = remainingClarifications.length === 0 ? "ITEMS_PARSED" : "NEEDS_CLARIFICATION";
  const totalEstimatedWeightKg = updatedItems.reduce(
    (sum: number, it: IntakeItem) => sum + (it.estimatedWeightKg || it.declaredWeightKg || 0),
    0
  );

  return {
    ...current,
    state: newState,
    location: updatedLocation,
    items: updatedItems,
    clarifications: remainingClarifications,
    evidence:
      newState === "ITEMS_PARSED"
        ? {
            type: "items_extracted" as const,
            itemsCount: updatedItems.length,
            totalEstimatedWeightKg,
            extractedAt: new Date().toISOString(),
          }
        : undefined,
  };
}

/**
 * Creates and updates an official domain Request model through the state machine.
 */
export function createDomainRequestFromIntake(intake: ValidatedIntakeResult): DomainRequest {
  const initialDraft: DomainRequest = {
    id: intake.requestId,
    userId: "usr-demo-01",
    description: intake.location.rawText,
    state: "DRAFT",
    ...(intake.feeCapInr !== null && intake.feeCapInr !== undefined ? { feeCapInr: intake.feeCapInr } : {}),
    items: intake.items.map((it: IntakeItem) => {
      const tax = getTaxonomyEntry(it.category);
      const domainCat = GROUP_TO_ITEM_CATEGORY[tax.group] ?? "OTHER";
      let hazardClass: HazardClass = "NON_HAZARDOUS";
      if (tax.hazardClass.startsWith("battery")) {
        hazardClass = "BATTERY";
      }
      return {
        id: it.id,
        requestId: intake.requestId,
        category: domainCat,
        description: it.rawText,
        quantity: it.quantity,
        estimatedWeightKg: it.estimatedWeightKg ?? it.declaredWeightKg ?? 1.0,
        confidence: it.confidence,
        hazardClass,
        createdAt: new Date().toISOString(),
      };
    }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (intake.state === "ITEMS_PARSED") {
    const transition = transitionState(initialDraft, "ITEMS_PARSED", intake.evidence || null);
    return transition.newRequest;
  }

  if (intake.state === "NEEDS_CLARIFICATION") {
    // Pipeline: DRAFT -> ITEMS_PARSED -> NEEDS_CLARIFICATION
    const intermediate = transitionState(initialDraft, "ITEMS_PARSED", null);
    const finalReq = transitionState(intermediate.newRequest, "NEEDS_CLARIFICATION", null);
    return finalReq.newRequest;
  }

  return initialDraft;
}
