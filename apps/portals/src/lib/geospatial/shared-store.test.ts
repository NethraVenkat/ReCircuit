import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { SupabaseRoutingStore } from "./shared-store.server";
import { RoutingService } from "./service";
import { syntheticInput, syntheticBooking, syntheticPreparation } from "./fixtures";
import { Verification } from "./contracts";
const db = new PGlite();
beforeAll(async () => { await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;"); const sql = fs.readFileSync("supabase/migrations/0007_routing_preparation.sql", "utf8"); await db.exec(sql); await db.exec(sql); }, 30000);
afterAll(() => db.close());
async function rpc<T>(name: string, args: object): Promise<T> {
  const a = args as Record<string, unknown>;
  const statements: Record<string, [string, unknown[]]> = {
    routing_lock: ["select public.routing_lock($1,$2,$3) as result", [a.p_tenant, a.p_token, a.p_release]],
    routing_history: ["select public.routing_history($1,$2) as result", [a.p_tenant, a.p_kind]],
    routing_append: ["select public.routing_append($1,$2,$3,$4) as result", [a.p_tenant, a.p_kind, JSON.stringify(a.p_document), a.p_token]],
  };
  const [sql, values] = statements[name]!;
  return (await db.query<{ result: T }>(sql, values)).rows[0]!.result;
}
it("executes additive migration twice and denies browser table/RPC privileges", async () => {
  const result = await db.query<{ allowed: boolean }>("select has_schema_privilege('anon','routing','USAGE') or has_function_privilege('authenticated','routing_append(text,text,jsonb,uuid)','EXECUTE') as allowed");
  expect(result.rows[0]!.allowed).toBe(false);
});
it("stores immutable settings atomically, enforces ownership/version/lease and tenant scope", async () => {
  const store = new SupabaseRoutingStore(rpc), empty = await store.settings("paperplus");
  await expect(store.append("paperplus", "settings", empty)).rejects.toThrow("LOCK_REQUIRED");
  await store.withLock("paperplus", async () => {
    await store.append("paperplus", "settings", empty);
    await expect(store.append("paperplus", "settings", empty)).rejects.toThrow("VERSION_CONFLICT");
    await expect(store.append("paperplus", "settings", { ...empty, tenant: "quickscrap", version: 2 })).rejects.toThrow("TENANT");
  });
  expect((await new SupabaseRoutingStore(rpc).history("paperplus", "settings")).length).toBe(1);
  expect(await store.history("quickscrap", "settings")).toEqual([]);
  await expect(db.query("update routing.history set document='{}' where tenant='paperplus'")).rejects.toThrow("IMMUTABLE");
});
it("coordinates separate repository instances through SQL while generation is suspended", async () => {
  const a = new SupabaseRoutingStore(rpc), b = new SupabaseRoutingStore(rpc);
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const held = a.withLock("quickscrap", async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
  await ready; await expect(b.withLock("quickscrap", async () => {})).rejects.toThrow("BUSY");
  release(); await held; await b.withLock("quickscrap", async () => { const settings = await b.settings("quickscrap"); await b.append("quickscrap", "settings", settings); });
  expect((await a.history("quickscrap", "settings")).length).toBe(1);
});
it("holds crashed-client leases until exact-token reconciliation; no automatic expiry", async () => {
  const token = randomUUID(); expect(await rpc("routing_lock", { p_tenant: "quickscrap", p_token: token, p_release: false })).toBe(true);
  expect(await rpc("routing_lock", { p_tenant: "quickscrap", p_token: randomUUID(), p_release: true })).toBe(false);
  await expect(new SupabaseRoutingStore(rpc).withLock("quickscrap", async () => {})).rejects.toThrow("BUSY");
  expect(await rpc("routing_lock", { p_tenant: "quickscrap", p_token: token, p_release: true })).toBe(true);
});
it("runs service save/reload/idempotency/staleness with actual SQL persistence", async () => {
  const input = syntheticInput(1), booking = syntheticBooking("synthetic-stop-000"), source = { list: async () => [structuredClone(booking)], verification: async () => Verification.parse(syntheticPreparation(booking).verification) }, provider = { configurationId: "sql-synthetic-v1", matrix: async () => input.matrix };
  const service = new RoutingService(source, new SupabaseRoutingStore(rpc), provider);
  await service.vehicles("deccan", input.vehicles); await service.review("deccan", { bookingId: booking.id, coordinate: input.pickups[0]!.coordinate, serviceSeconds: 60, assumptionVersion: "SQL test" }, "sql-test-operator");
  const key = randomUUID(), before = JSON.stringify(booking), saved = await service.generate("deccan", "2026-10-24", key);
  const reload = new RoutingService(source, new SupabaseRoutingStore(rpc), provider);
  expect(await reload.read("deccan", saved.id)).toEqual(saved); expect((await reload.generate("deccan", "2026-10-24", key)).id).toBe(saved.id); expect((await reload.history("deccan")).length).toBe(1);
  await expect(reload.read("paperplus", saved.id)).rejects.toThrow("NOT_FOUND");
  const originalFee = booking.chargedFeeInr; booking.chargedFeeInr = (originalFee ?? 0) + 1; expect((await reload.read("deccan", saved.id)).current).toBe(false); booking.chargedFeeInr = originalFee;
  expect(JSON.stringify(booking)).toBe(before);
});
it("failed SQL append has no partial history and a failure releases the lease", async () => {
  const store = new SupabaseRoutingStore(rpc), before = await store.history("quickscrap", "settings");
  await expect(store.withLock("quickscrap", async () => { const settings = await store.settings("quickscrap"); await store.append("quickscrap", "settings", { ...settings, version: 99 }); })).rejects.toThrow("VERSION_CONFLICT");
  expect(await store.history("quickscrap", "settings")).toEqual(before);
  await store.withLock("quickscrap", async () => {});
});
it("executes non-destructive rollback and reapply while retaining immutable history", async () => {
  const count = (await db.query<{ n: number }>("select count(*)::int as n from routing.history")).rows[0]!.n;
  await db.exec(fs.readFileSync("supabase/rollback/0007_routing_preparation.sql", "utf8"));
  expect((await db.query<{ allowed: boolean }>("select has_function_privilege('service_role','routing_append(text,text,jsonb,uuid)','EXECUTE') as allowed")).rows[0]!.allowed).toBe(false);
  expect((await db.query<{ n: number }>("select count(*)::int as n from routing.history")).rows[0]!.n).toBe(count);
  await db.exec(fs.readFileSync("supabase/migrations/0007_routing_preparation.sql", "utf8"));
  expect((await db.query<{ allowed: boolean }>("select has_function_privilege('service_role','routing_append(text,text,jsonb,uuid)','EXECUTE') as allowed")).rows[0]!.allowed).toBe(true);
});
