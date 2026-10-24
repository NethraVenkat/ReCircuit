import { cloudRpc } from "@recircuit/db";

/** Direct real PostgREST transport for an explicitly guarded loopback test only.
 * Hosted Supabase keeps its existing /rest/v1 prefix and transport unchanged.
 */
export async function routingRpc<T>(name: string, args: object): Promise<T> {
  if (process.env.ROUTING_NATIVE_POSTGREST_TEST_MODE !== "true") return cloudRpc<T>(name, args);
  if (process.env.NODE_ENV === "production" || process.env.RECIRCUIT_PERSISTENCE !== "local" || process.env.ROUTING_SHARED_TEST_MODE !== "true" || process.env.ROUTING_STORE_BACKEND !== "supabase-local-test") throw Error("ROUTING_NATIVE_LOCAL_TEST_ONLY");
  const origin = process.env.SUPABASE_URL;
  let url: URL;
  try { url = new URL(origin || ""); } catch { throw Error("ROUTING_NATIVE_LOCAL_TEST_CONFIGURATION_REQUIRED"); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.origin !== origin || !["routing_lock", "routing_history", "routing_append"].includes(name)) throw Error("ROUTING_NATIVE_LOCAL_TEST_CONFIGURATION_REQUIRED");
  const token = process.env.ROUTING_NATIVE_POSTGREST_TOKEN;
  if (!token?.trim()) throw Error("ROUTING_NATIVE_LOCAL_TEST_CONFIGURATION_REQUIRED");
  let response: Response;
  try {
    response = await fetch(`${origin}/rpc/${name}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  } catch { throw Error("ROUTING_NATIVE_TRANSPORT_UNAVAILABLE"); }
  if (!response.ok) throw Error(`ROUTING_NATIVE_RPC_HTTP_${response.status}`);
  try { return await response.json() as T; } catch { throw Error("ROUTING_NATIVE_INVALID_RESPONSE"); }
}
