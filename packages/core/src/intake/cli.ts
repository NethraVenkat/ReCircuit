#!/usr/bin/env node
/**
 * packages/core/src/intake/cli.ts
 *
 * CLI for manual user intake checks:
 * npm run intake -- "<free text>"
 */

import { parseIntake } from "./parser.js";
import { createDomainRequestFromIntake } from "./post-processor.js";
import type { IntakeItem, IntakeClarification } from "./schema.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const text = args.join(" ").trim();

  if (!text) {
    console.error("Usage: npm run intake -- \"<household recycling request text>\"");
    process.exit(1);
  }

  console.log(`\n🔍 Parsing intake request: "${text}"...\n`);

  try {
    const validated = await parseIntake(text);
    const domainRequest = createDomainRequestFromIntake(validated);

    console.log("=== VALIDATED INTAKE RESULT ===");
    console.log(JSON.stringify(validated, null, 2));

    console.log("\n=== RESULTING REQUEST PIPELINE STATE ===");
    console.log(`Request ID: ${domainRequest.id}`);
    console.log(`State:      ${domainRequest.state}`);
    console.log(`Fee Cap:    ${domainRequest.feeCapInr !== undefined ? `₹${domainRequest.feeCapInr}` : "null (no limit stated)"}`);
    console.log(`Location:   ${validated.location.locality ?? "Unknown"}, ${validated.location.city} (${validated.location.pincode ?? "N/A"})`);
    console.log(`Items:      ${validated.items.length} item(s)`);
    validated.items.forEach((it: IntakeItem, idx: number) => {
      console.log(`  [${idx + 1}] ${it.rawText} -> ${it.category} (qty: ${it.quantity}, weight: ${it.estimatedWeightKg ?? it.declaredWeightKg ?? "unknown"} kg [${it.weightSource}], hazard: ${it.hazardClass})`);
    });

    if (validated.clarifications.length > 0) {
      console.log("\n⚠️ OUTSTANDING CLARIFICATIONS NEEDED:");
      validated.clarifications.forEach((c: IntakeClarification) => {
        console.log(`  • [${c.code}] ${c.question}`);
      });
    } else {
      console.log("\n✅ Clean intake. Successfully moved to state ITEMS_PARSED.");
    }
  } catch (err) {
    console.error("Error parsing intake:", err);
    process.exit(1);
  }
}

export { main };
void main();

