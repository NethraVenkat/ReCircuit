import fs from "fs";
import path from "path";
import { Verifier } from "./verifier.js";
import type { LegVerificationContext, VerifierOptions, VerifierResult } from "./types.js";

export class VerificationRunner {
  /**
   * Executes independent verification for a submitted leg, writes audit log,
   * and persists proof ledger entry.
   */
  public static async verifyLegWithAudit(
    context: LegVerificationContext,
    options: VerifierOptions = {}
  ): Promise<VerifierResult> {
    const result = await Verifier.verifyLeg(context, options);

    // Persist verification proof to disk
    try {
      const dataDir = path.resolve(process.cwd(), ".data", "verifications");
      fs.mkdirSync(dataDir, { recursive: true });
      const filename = path.join(dataDir, `${result.bookingReference}.json`);
      fs.writeFileSync(filename, JSON.stringify(result, null, 2), "utf-8");

      // Append verification event to action log
      const actionLogPath = path.resolve(process.cwd(), ".data", "action-log.jsonl");
      const logEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: "independent_verification",
        legId: context.leg.id,
        recyclerId: context.leg.recyclerId,
        bookingReference: result.bookingReference,
        submittingSessionId: result.submittingSessionId,
        verifyingSessionId: result.verifyingSessionId,
        observedStatus: result.observedStatus,
        verified: result.verified,
        screenshotRef: result.screenshotRef,
      };
      fs.appendFileSync(actionLogPath, JSON.stringify(logEntry) + "\n", "utf-8");
    } catch {
      // Best-effort audit logging
    }

    return result;
  }
}
