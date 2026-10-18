/**
 * packages/core/src/intake/parser.ts
 *
 * User Intake Parser: calls generateStructured with LlmProposedIntakeSchema,
 * then pipes the LLM proposal through deterministic postProcessIntake.
 */

import { generateStructured } from "@recircuit/llm";
import { LlmProposedIntakeSchema, type ValidatedIntakeResult, type LlmProposedIntake } from "./schema.js";
import { postProcessIntake } from "./post-processor.js";

export const INTAKE_SYSTEM_PROMPT = `You are the household intake parser for ReCircuit, an autonomous reverse-logistics agent for e-waste and recycling pickups in Hyderabad, India.

Your goal is to parse household free-text requests into structured proposals.
Rules:
1. Extract location:
   - rawText: the location text mentioned
   - locality: locality name if mentioned (e.g., Kukatpally, KPHB, Madhapur, Sanathnagar, Gachibowli)
   - pincode: 6-digit postal code if mentioned
   - city: city name (default "Hyderabad")
   - confidence: confidence score 0.0 to 1.0

2. Extract feeCapInr:
   - Return the integer rupee amount ONLY if explicitly stated by user (e.g., "max fee ₹150", "cap 200 rs", "limit 100").
   - If user does not mention a fee or payment limit, return null.
   - NEVER invent or assume a fee cap.

3. Extract items:
   - rawText: the exact phrase describing the item
   - category: one of [laptop, desktop, mobile_phone, charger_cable, battery_household, small_electronics, large_appliance, newspaper, cardboard, books_magazines, plastic, metal, glass, other]
   - quantity: integer count (convert words like "two" to 2)
   - declaredWeightKg: numeric weight in kg ONLY if explicitly mentioned by user (e.g. "8 kg newspaper" -> 8). If no weight mentioned, return null.
   - hazardClass: "battery_li_ion" for laptops/smartphones, "battery_alkaline" for household batteries, "none" for paper/plastic/metal/cables, or "battery_unknown"
   - confidence: 0.0 to 1.0. If the description is vague or ambiguous (e.g. "junk", "box with wires"), set confidence < 0.7.

Output MUST be strictly valid JSON conforming to the schema.`;

export interface ParseIntakeOptions {
  modelTier?: "fast" | "strong";
  testFixtureName?: string;
  existingRequestId?: string;
}

export async function parseIntake(
  text: string,
  options?: ParseIntakeOptions
): Promise<ValidatedIntakeResult> {
  const proposed = await generateStructured<LlmProposedIntake>({
    schema: LlmProposedIntakeSchema,
    system: INTAKE_SYSTEM_PROMPT,
    user: text,
    modelTier: options?.modelTier || "fast",
    ...(options?.testFixtureName !== undefined ? { testFixtureName: options.testFixtureName } : {}),
  });

  return postProcessIntake(text, proposed, options?.existingRequestId);
}
