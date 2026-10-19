/**
 * packages/core/src/approval/safe-action.ts
 *
 * Safe Action Entry Point for automated browser actions.
 * Guarantees that the agent NEVER executes bookings without:
 * 1. Valid leg state (APPROVED or SUBMITTING resuming from NEEDS_HUMAN)
 * 2. Explicit approved user decision matching exact planHash
 * 3. Unused idempotency key
 * 4. Observed booking fee matching approved fee (FEE_CHANGED_REAPPROVAL_REQUIRED)
 *
 * Writes all attempts (allowed or blocked) to an append-only audit log.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { hashPlan, makeIdempotencyKey } from "../state-machine.js";
import type { ActionAttemptLog, SafeActionParams } from "./types.js";

export class SafeActionBlockedError extends Error {
  public readonly code: string;
  public readonly attemptLog: ActionAttemptLog;

  constructor(message: string, code: string, attemptLog: ActionAttemptLog) {
    super(message);
    this.name = "SafeActionBlockedError";
    this.code = code;
    this.attemptLog = attemptLog;
  }
}

export class FeeChangedReapprovalRequiredError extends SafeActionBlockedError {
  constructor(attemptLog: ActionAttemptLog, approvedFee: number, observedFee: number) {
    super(
      `Observed fee ₹${observedFee} differs from approved fee ₹${approvedFee}. Re-approval required before submission.`,
      "FEE_CHANGED_REAPPROVAL_REQUIRED",
      attemptLog
    );
    this.name = "FeeChangedReapprovalRequiredError";
  }
}

// In-memory buffer of action logs for testing & fast retrieval
const inMemoryActionLogs: ActionAttemptLog[] = [];

/**
 * Returns a copy of all recorded action logs (in-memory + disk).
 */
export function getActionLogEntries(): ActionAttemptLog[] {
  const logs = [...inMemoryActionLogs];
  try {
    const logFile = path.resolve(process.cwd(), ".data", "action-log.jsonl");
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as ActionAttemptLog;
          if (!logs.some((l) => l.id === entry.id)) {
            logs.push(entry);
          }
        } catch {
          // ignore malformed line
        }
      }
    }
  } catch {
    // ignore read error
  }
  return logs;
}

/**
 * Clears recorded in-memory action logs and disk action-log.jsonl (used between test runs).
 */
export function clearActionLogs(): void {
  inMemoryActionLogs.length = 0;
  try {
    const logFile = path.resolve(process.cwd(), ".data", "action-log.jsonl");
    if (fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, "", "utf-8");
    }
  } catch (err) {
    void err;
  }
}

/**
 * Loads all used idempotency keys from the action attempt store (in-memory + disk).
 */
export function getUsedIdempotencyKeysFromStore(): Set<string> {
  const used = new Set<string>();
  for (const log of inMemoryActionLogs) {
    if (log.allowed && log.idempotencyKey) {
      used.add(log.idempotencyKey);
    }
  }
  try {
    const logFile = path.resolve(process.cwd(), ".data", "action-log.jsonl");
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          if (entry.allowed === true && typeof entry.idempotencyKey === "string") {
            used.add(entry.idempotencyKey);
          }
        } catch (err) {
          void err;
        }
      }
    }
  } catch (err) {
    void err;
  }
  return used;
}

/**
 * Appends an action attempt record to disk (.data/action-log.jsonl) and memory.
 */
function recordActionAttempt(attempt: ActionAttemptLog): void {
  inMemoryActionLogs.push(attempt);
  try {
    const logDir = path.resolve(process.cwd(), ".data");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, "action-log.jsonl");
    fs.appendFileSync(logFile, JSON.stringify(attempt) + "\n", "utf-8");
  } catch {
    // Disk write failure in read-only environment does not block in-memory tracking
  }
}

/**
 * Gating function that MUST be called before any browser submission action.
 * Throws SafeActionBlockedError or FeeChangedReapprovalRequiredError if not allowed.
 */
export function assertActionAllowed(params: SafeActionParams): {
  allowed: true;
  idempotencyKey: string;
  attemptLog: ActionAttemptLog;
} {
  const { leg, plan, approval, action, observedFeeInr, usedIdempotencyKeys } = params;
  const currentPlanHash = plan.planHash || hashPlan(plan);
  const idempotencyKey =
    leg.idempotencyKey || makeIdempotencyKey(currentPlanHash, leg.id, leg.recyclerId);

  const approvedFeeInr = leg.estimatedFee;
  const timestamp = new Date().toISOString();
  const attemptId = randomUUID();

  // 1. Check Leg State
  const validLegStates = ["APPROVED", "SUBMITTING"]; // SUBMITTING allowed when resuming from NEEDS_HUMAN
  if (!validLegStates.includes(leg.state)) {
    const attemptLog: ActionAttemptLog = {
      id: attemptId,
      timestamp,
      requestId: plan.requestId,
      legId: leg.id,
      recyclerId: leg.recyclerId,
      planHash: currentPlanHash,
      action,
      allowed: false,
      blockReason: `Leg state "${leg.state}" is not APPROVED or SUBMITTING`,
      approvedFeeInr,
      observedFeeInr,
      idempotencyKey,
    };
    recordActionAttempt(attemptLog);
    throw new SafeActionBlockedError(
      `Action "${action}" blocked: Leg is in state "${leg.state}", expected APPROVED`,
      "INVALID_LEG_STATE",
      attemptLog
    );
  }

  // 2. Check Approval Existence & Decision
  if (!approval || approval.decision !== "approved") {
    const attemptLog: ActionAttemptLog = {
      id: attemptId,
      timestamp,
      requestId: plan.requestId,
      legId: leg.id,
      recyclerId: leg.recyclerId,
      planHash: currentPlanHash,
      action,
      allowed: false,
      blockReason: `No valid approved user decision found (decision: "${approval?.decision ?? "none"}")`,
      approvedFeeInr,
      observedFeeInr,
      idempotencyKey,
    };
    recordActionAttempt(attemptLog);
    throw new SafeActionBlockedError(
      `Action "${action}" blocked: Plan lacks approved user decision`,
      "NO_USER_APPROVAL",
      attemptLog
    );
  }

  // 3. Check Stale Approval / Plan Hash Mismatch
  if (approval.planHash !== currentPlanHash) {
    const attemptLog: ActionAttemptLog = {
      id: attemptId,
      timestamp,
      requestId: plan.requestId,
      legId: leg.id,
      recyclerId: leg.recyclerId,
      planHash: currentPlanHash,
      action,
      allowed: false,
      blockReason: `Stale approval: approved planHash (${approval.planHash.slice(0, 16)}...) != current planHash (${currentPlanHash.slice(0, 16)}...)`,
      approvedFeeInr,
      observedFeeInr,
      idempotencyKey,
    };
    recordActionAttempt(attemptLog);
    throw new SafeActionBlockedError(
      `Action "${action}" blocked: Plan has changed since approval (stale approval). Re-approval required.`,
      "STALE_APPROVAL_PLAN_CHANGED",
      attemptLog
    );
  }

  // 4. Check Data-Wipe Acknowledgement for Data-Bearing Devices
  const dataKeywords = ["laptop", "phone", "desktop", "computer", "notebook", "tablet", "hard drive", "ssd", "disk"];
  const hasDataBearingDevice = (leg.items || []).some((item) => {
    const desc = (item.description || "").toLowerCase();
    const cat = (item.category || "").toLowerCase();
    return dataKeywords.some((k) => desc.includes(k) || cat.includes(k));
  });

  if (hasDataBearingDevice && approval.dataWipeConfirmedByUser !== true) {
    const attemptLog: ActionAttemptLog = {
      id: attemptId,
      timestamp,
      requestId: plan.requestId,
      legId: leg.id,
      recyclerId: leg.recyclerId,
      planHash: currentPlanHash,
      action,
      allowed: false,
      blockReason: "Data-wipe destruction declaration required for data-bearing electronic devices but was not confirmed by user",
      approvedFeeInr,
      observedFeeInr,
      idempotencyKey,
    };
    recordActionAttempt(attemptLog);
    throw new SafeActionBlockedError(
      `Action "${action}" blocked: User has not confirmed data wipe for data-bearing devices`,
      "DATA_WIPE_NOT_CONFIRMED",
      attemptLog
    );
  }

  // 5. Check Idempotency Key Reuse
  // assertActionAllowed loads used keys from the action/browser_actions store itself;
  // callers cannot bypass by passing an empty list.
  const storeLogs = getActionLogEntries();
  const isResumingSameLeg =
    leg.state === "SUBMITTING" &&
    storeLogs.some((l) => l.allowed && l.idempotencyKey === idempotencyKey && l.legId === leg.id);
  const storeKeys = getUsedIdempotencyKeysFromStore();
  const callerKeys = usedIdempotencyKeys ? Array.from(usedIdempotencyKeys) : [];
  const keysSet = new Set([...storeKeys, ...callerKeys]);
  if (!isResumingSameLeg && keysSet.has(idempotencyKey)) {
    const attemptLog: ActionAttemptLog = {
      id: attemptId,
      timestamp,
      requestId: plan.requestId,
      legId: leg.id,
      recyclerId: leg.recyclerId,
      planHash: currentPlanHash,
      action,
      allowed: false,
      blockReason: `Idempotency key "${idempotencyKey}" has already been used`,
      approvedFeeInr,
      observedFeeInr,
      idempotencyKey,
    };
    recordActionAttempt(attemptLog);
    throw new SafeActionBlockedError(
      `Action "${action}" blocked: Idempotency key already used for submission`,
      "IDEMPOTENCY_KEY_REUSED",
      attemptLog
    );
  }

  // 5. Check Fee Discrepancy on Booking Page
  if (observedFeeInr !== approvedFeeInr) {
    const attemptLog: ActionAttemptLog = {
      id: attemptId,
      timestamp,
      requestId: plan.requestId,
      legId: leg.id,
      recyclerId: leg.recyclerId,
      planHash: currentPlanHash,
      action,
      allowed: false,
      blockReason: `Fee changed: observed fee ₹${observedFeeInr} on page != approved fee ₹${approvedFeeInr}`,
      approvedFeeInr,
      observedFeeInr,
      idempotencyKey,
    };
    recordActionAttempt(attemptLog);
    throw new FeeChangedReapprovalRequiredError(attemptLog, approvedFeeInr, observedFeeInr);
  }

  // 6. Action Allowed! Log success attempt
  const attemptLog: ActionAttemptLog = {
    id: attemptId,
    timestamp,
    requestId: plan.requestId,
    legId: leg.id,
    recyclerId: leg.recyclerId,
    planHash: currentPlanHash,
    action,
    allowed: true,
    approvedFeeInr,
    observedFeeInr,
    idempotencyKey,
  };
  recordActionAttempt(attemptLog);

  return {
    allowed: true,
    idempotencyKey,
    attemptLog,
  };
}

