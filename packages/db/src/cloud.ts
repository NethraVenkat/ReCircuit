import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { StatusEvent } from "@recircuit/core";
import { hashPlan } from "@recircuit/core";
import type { IRepository, RequestRecord, JobRecord } from "./types.js";

export class PersistenceError extends Error {
  constructor(public readonly code: string) { super(`PERSISTENCE_UNAVAILABLE: ${code}`); }
}

export function cloudConfigured(): boolean {
  if (process.env.RECIRCUIT_PERSISTENCE === "local") {
    if (process.env.NODE_ENV === "production") throw new PersistenceError("LOCAL_MODE_DISABLED_IN_PRODUCTION");
    return false;
  }
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Server-only transport. Errors never contain URLs, tokens or response payloads. */
export async function cloudRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new PersistenceError("CONFIGURATION_MISSING");
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(30000), headers: {
      apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers,
    } });
  } catch { throw new PersistenceError("NETWORK"); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { code?: string; message?: string };
    if (error.message?.startsWith("BUSY") || error.message?.startsWith("STALE")) throw new Error(error.message);
    throw new PersistenceError(error.code || `HTTP_${response.status}`);
  }
  const text = await response.text();
  try { return (text ? JSON.parse(text) : null) as T; }
  catch { throw new PersistenceError("INVALID_RESPONSE"); }
}

export async function cloudRpc<T>(name: string, args: object): Promise<T> {
  return cloudRequest<T>(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}

const leases = new AsyncLocalStorage<{ id: string; token: string }>();
function hydrate(record: RequestRecord, revision: number): RequestRecord {
  return { ...record, request: { ...record.request, items: record.items }, revision };
}
export class SupabaseHouseholdRepository implements IRepository {
  async withRequestLock<T>(id: string, run: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    if (!await cloudRpc<boolean>("household_lock", { p_id: id, p_token: token })) throw new Error("BUSY: Request action already running; reconcile persisted state before retrying.");
    // Locks never expire automatically while external side effects may be running.
    // A crashed process requires explicit reconciliation before administrative release.
    try { return await leases.run({ id, token }, run); }
    finally {
      await this.releaseLock(id, token);
    }
  }
  private async releaseLock(id: string, token: string): Promise<void> {
    if (!await cloudRpc<boolean>("household_lock", { p_id: id, p_token: token, p_release: true })) throw new PersistenceError("LOCK_RELEASE_FAILED");
  }
  async saveRequest(record: RequestRecord): Promise<void> {
    if (record.approval && "decision" in record.approval && record.approval.decision === "approved" &&
        (!record.plan || !("planHash" in record.approval) || record.approval.planHash !== hashPlan(record.plan))) throw new Error("STALE: approval hash mismatch");
    const lease = leases.getStore();
    record.revision = await cloudRpc<number>("household_save", {
      p_record: record, p_revision: record.revision ?? null,
      p_token: lease?.id === record.request.id ? lease.token : null,
    });
  }
  async getRequest(id: string, ownerId?: string): Promise<RequestRecord | null> {
    const rows = await cloudRequest<Array<{ record: RequestRecord; revision: number }>>(`/rest/v1/household_records?id=eq.${encodeURIComponent(id)}&select=record,revision${ownerId ? `&owner_id=eq.${encodeURIComponent(ownerId)}` : ""}`);
    return rows[0] ? hydrate(rows[0].record, rows[0].revision) : null;
  }
  async listRequests(ownerId?: string): Promise<RequestRecord[]> {
    const records: RequestRecord[] = [];
    for (let offset = 0; ; offset += 500) {
      const rows = await cloudRequest<Array<{ record: RequestRecord; revision: number }>>(`/rest/v1/household_records?select=record,revision&order=id&offset=${offset}&limit=500${ownerId ? `&owner_id=eq.${encodeURIComponent(ownerId)}` : ""}`);
      records.push(...rows.map(r => hydrate(r.record, r.revision)));
      if (rows.length < 500) return records.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    }
  }
  async enqueueJob(type: string, payload: Record<string, unknown>): Promise<JobRecord> {
    const record: JobRecord = { id: randomUUID(), type, payload, status: "pending", attempts: 0, createdAt: new Date().toISOString() };
    await cloudRequest("/rest/v1/household_jobs", { method: "POST", body: JSON.stringify({ id: record.id, record }) });
    return record;
  }
  async dequeueJob(type?: string): Promise<JobRecord | null> { return cloudRpc("household_dequeue", { p_type: type ?? null }); }
  async completeJob(id: string, result?: Record<string, unknown>): Promise<void> {
    await cloudRpc("household_finish_job", { p_id: id, p_result: result ?? null });
  }
  async failJob(id: string, error: string): Promise<void> { await cloudRpc("household_finish_job", { p_id: id, p_error: error }); }
  async appendAction(record: Record<string, unknown>, idempotencyKey?: string): Promise<void> {
    if (idempotencyKey) {
      await cloudRpc("household_claim_action", { p_record: record, p_key: idempotencyKey });
      return;
    }
    await cloudRequest("/rest/v1/household_actions", { method: "POST", body: JSON.stringify({
      request_id: record.requestId ?? null, leg_id: record.legId ?? null,
      idempotency_key: idempotencyKey ?? null, record,
    }) });
  }
  async appendAudit(event: StatusEvent): Promise<void> { await this.appendAction({ ...event }); }
  async getActionRecords(requestId: string): Promise<Array<Record<string, unknown>>> {
    const records: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 500) {
      const rows = await cloudRequest<Array<{ record: Record<string, unknown> }>>(`/rest/v1/household_actions?select=record&request_id=eq.${encodeURIComponent(requestId)}&order=id&offset=${offset}&limit=500`);
      records.push(...rows.map(r => r.record));
      if (rows.length < 500) return records;
    }
  }
  async getAudits(filter?: { requestId?: string; legId?: string }): Promise<StatusEvent[]> {
    const query = `${filter?.requestId ? `&request_id=eq.${encodeURIComponent(filter.requestId)}` : ""}${filter?.legId ? `&leg_id=eq.${encodeURIComponent(filter.legId)}` : ""}`;
    const events: StatusEvent[] = [];
    for (let offset = 0; ; offset += 500) {
      const rows = await cloudRequest<Array<{ record: StatusEvent }>>(`/rest/v1/household_actions?select=record${query}&order=id&offset=${offset}&limit=500`);
      events.push(...rows.map(r => r.record).filter(r => typeof r.newState === "string" && typeof r.previousState === "string"));
      if (rows.length < 500) return events;
    }
  }
}

export async function storeEvidence(name: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const key = `${randomUUID()}/${name.replace(/[^a-zA-Z0-9_.-]/g,"_")}`;
  await cloudRequest(`/storage/v1/object/recircuit-evidence/${key}`, {
    method: "POST", headers: { "Content-Type": contentType }, body: Buffer.from(bytes),
  });
  return `storage://recircuit-evidence/${key}`;
}

/** Caller must check household ownership and that this reference belongs to it. */
export async function signEvidence(reference: string): Promise<string> {
  if (!reference.startsWith("storage://recircuit-evidence/")) throw new Error("NOT_FOUND");
  const key = reference.slice("storage://recircuit-evidence/".length);
  if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.includes("..")) throw new Error("NOT_FOUND");
  const result = await cloudRequest<{ signedURL: string }>(`/storage/v1/object/sign/recircuit-evidence/${key}`, { method: "POST", body: JSON.stringify({ expiresIn: 60 }) });
  return `${process.env.SUPABASE_URL}/storage/v1${result.signedURL}`;
}
