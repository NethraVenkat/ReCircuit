import { afterEach, expect, it, vi } from "vitest";
import { routingRpc } from "./native-postgrest.server";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function local(): void {
  for (const [key, value] of Object.entries({ NODE_ENV: "development", RECIRCUIT_PERSISTENCE: "local", ROUTING_SHARED_TEST_MODE: "true", ROUTING_STORE_BACKEND: "supabase-local-test", ROUTING_NATIVE_POSTGREST_TEST_MODE: "true", SUPABASE_URL: "http://127.0.0.1:35431", ROUTING_NATIVE_POSTGREST_TOKEN: "synthetic-token" })) vi.stubEnv(key, value);
}
it.each(["https://example.org", "http://example.org", "http://127.0.0.1:35431/path", "http://user@127.0.0.1:35431", "http://127.0.0.1:35431/"])("refuses non-exact loopback origins before network: %s", async origin => {
  local(); vi.stubEnv("SUPABASE_URL", origin); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(routingRpc("routing_history", {})).rejects.toThrow("CONFIGURATION_REQUIRED"); expect(fetcher).not.toHaveBeenCalled();
});
it.each([["NODE_ENV", "production"], ["RECIRCUIT_PERSISTENCE", "supabase"], ["ROUTING_SHARED_TEST_MODE", "false"], ["ROUTING_STORE_BACKEND", "local"]])("refuses unsafe native mode %s=%s before network", async (key, value) => {
  local(); vi.stubEnv(key, value); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(routingRpc("routing_history", {})).rejects.toThrow("LOCAL_TEST_ONLY"); expect(fetcher).not.toHaveBeenCalled();
});
it("uses direct real PostgREST path, dedicated token and JSON serialization", async () => {
  local(); const fetcher = vi.fn().mockResolvedValue(Response.json([])); vi.stubGlobal("fetch", fetcher);
  expect(await routingRpc("routing_history", { p_tenant: "deccan", p_kind: "settings" })).toEqual([]);
  expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:35431/rpc/routing_history", expect.objectContaining({ method: "POST", redirect: "error", body: '{"p_tenant":"deccan","p_kind":"settings"}', headers: { Authorization: "Bearer synthetic-token", "Content-Type": "application/json" } }));
});
it("does not disclose transport/body/authorization errors", async () => {
  local(); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Error("sensitive server detail")));
  await expect(routingRpc("routing_history", {})).rejects.toThrow(/^ROUTING_NATIVE_TRANSPORT_UNAVAILABLE$/);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive server detail", { status: 401 })));
  await expect(routingRpc("routing_history", {})).rejects.toThrow(/^ROUTING_NATIVE_RPC_HTTP_401$/);
});
