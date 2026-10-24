import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { routingRpc } from "./native-postgrest.server";
import { RouteProposalRecord, Tenant } from "./contracts";
import { Settings, type RoutingPersistence, type WorkspaceSettings } from "./service";
import type { RecyclerId } from "../types";
type Rpc = <T>(name: string, args: object) => Promise<T>;
/** Shared SQL leases, not process-local locks. No automatic release of crashed holders. */
export class SupabaseRoutingStore implements RoutingPersistence {
  private readonly leases = new AsyncLocalStorage<{ tenant: RecyclerId; token: string }>();
  constructor(private readonly rpc: Rpc = routingRpc) {}
  async withLock<T>(tenant: RecyclerId, run: () => Promise<T>): Promise<T> {
    Tenant.parse(tenant); const token = randomUUID();
    if (await this.rpc("routing_lock", { p_tenant: tenant, p_token: token, p_release: false }) !== true) throw Error("ROUTING_BUSY");
    try { return await this.leases.run({ tenant, token }, run); }
    finally { await this.release(tenant, token); }
  }
  private async release(tenant: RecyclerId, token: string): Promise<void> { if (await this.rpc("routing_lock", { p_tenant: tenant, p_token: token, p_release: true }) !== true) throw Error("ROUTING_LOCK_RELEASE_FAILED_RECONCILE_HISTORY"); }
  async history<T>(tenant: RecyclerId, kind: "settings" | "proposals"): Promise<T[]> {
    Tenant.parse(tenant); z.enum(["settings", "proposals"]).parse(kind);
    const raw = z.array(z.unknown()).parse(await this.rpc("routing_history", { p_tenant: tenant, p_kind: kind }));
    const values = raw.map(value => kind === "settings" ? Settings.parse(value) : RouteProposalRecord.parse(value));
    if (values.some(v => v.tenant !== tenant) || values.some((v, i) => v.version !== i + 1)) throw Error("ROUTING_STORED_SCOPE_OR_VERSION_INVALID");
    return values as T[];
  }
  async settings(tenant: RecyclerId): Promise<WorkspaceSettings> {
    return (await this.history<WorkspaceSettings>(tenant, "settings")).at(-1) ?? { tenant, version: 1, createdAt: new Date(0).toISOString(), vehicles: [], reviews: {}, geocoding: {} };
  }
  async append(tenant: RecyclerId, kind: "settings" | "proposals", value: { tenant: RecyclerId; version: number }): Promise<void> {
    const lease = this.leases.getStore();
    if (!lease || lease.tenant !== tenant) throw Error("ROUTING_LOCK_REQUIRED");
    const document = kind === "settings" ? Settings.parse(value) : RouteProposalRecord.parse(value);
    if (document.tenant !== tenant || (kind === "proposals" && RouteProposalRecord.parse(document).input.tenant !== tenant)) throw Error("TENANT_MISMATCH");
    if (await this.rpc("routing_append", { p_tenant: tenant, p_kind: kind, p_document: document, p_token: lease.token }) !== true) throw Error("ROUTING_WRITE_NOT_ACKNOWLEDGED");
  }
}
