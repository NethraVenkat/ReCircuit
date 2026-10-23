import { expect, it } from "vitest";
import { SupabaseRoutingStore } from "./shared-store.server";
it.skipIf(!process.env.ROUTING_TEST_RPC_URL)("isolated subprocess uses database-owned lease", async () => {
  const base = process.env.ROUTING_TEST_RPC_URL!;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error("LOCAL_TEST_RPC_ONLY");
  const store = new SupabaseRoutingStore(async <T>(name: string, args: object): Promise<T> => {
    const response = await fetch(base + "/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, args }) });
    const body = await response.json(); if (!response.ok) throw Error(body.error); return body.result as T;
  });
  if (process.env.ROUTING_TEST_CLIENT_ROLE === "contender") {
    await expect(store.withLock("deccan", async () => {})).rejects.toThrow("BUSY");
  } else {
    await store.withLock("deccan", async () => {
      const prior = await store.settings("deccan");
      if (process.env.ROUTING_TEST_CLIENT_ROLE === "holder") await fetch(base + "/hold");
      const next = { ...prior, version: (await store.history("deccan", "settings")).length + 1, createdAt: new Date().toISOString() };
      await store.append("deccan", "settings", next);
    });
  }
}, 30000);
