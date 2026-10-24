import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { SupabaseRoutingStore } from "./shared-store.server";

it.skipIf(!process.env.ROUTING_NATIVE_CLIENT_ROLE)("separate process uses the default real native PostgREST adapter", async () => {
  if (process.env.ROUTING_NATIVE_POSTGREST_TEST_MODE !== "true") throw Error("NATIVE_TEST_MODE_REQUIRED");
  const store = new SupabaseRoutingStore();
  if (process.env.ROUTING_NATIVE_CLIENT_ROLE === "holder") {
    const marker = process.env.ROUTING_NATIVE_CLIENT_MARKER;
    if (!marker || !path.isAbsolute(marker)) throw Error("ABSOLUTE_TEST_MARKER_REQUIRED");
    await store.withLock("quickscrap", async () => {
      await fs.writeFile(marker, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: "wx" });
      await new Promise<void>((_resolve, reject) => setTimeout(() => reject(Error("BOUNDED_HOLDER_DEADLINE")), 25000));
    });
  } else if (process.env.ROUTING_NATIVE_CLIENT_ROLE === "contender") {
    await expect(store.withLock("quickscrap", async () => {})).rejects.toThrow("BUSY");
  } else if (process.env.ROUTING_NATIVE_CLIENT_ROLE === "recovered") {
    const expectedVersion = (await store.history("quickscrap", "settings")).length + 1;
    await store.withLock("quickscrap", async () => {
      const prior = await store.settings("quickscrap");
      const next = { ...prior, version: expectedVersion, createdAt: new Date().toISOString() };
      await store.append("quickscrap", "settings", next);
    });
    const history = await store.history<{ version: number }>("quickscrap", "settings");
    expect(history).toHaveLength(expectedVersion);
    expect(history.at(-1)?.version).toBe(expectedVersion);
  } else if (process.env.ROUTING_NATIVE_CLIENT_ROLE === "validation") {
    // The low-level SQL uniqueness fixture is deliberately incomplete; never trust SQL acceptance as application validity.
    await expect(store.history("paperplus", "proposals")).rejects.toThrow();
  } else throw Error("UNKNOWN_NATIVE_CLIENT_ROLE");
}, 30000);
