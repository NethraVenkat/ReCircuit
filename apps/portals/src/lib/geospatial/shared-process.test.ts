import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
it("coordinates separate application processes through actual isolated SQL RPCs", async () => {
  const db = new PGlite(); await db.exec("create role anon; create role authenticated; create role service_role BYPASSRLS;"); await db.exec(await fs.readFile("supabase/migrations/0007_routing_preparation.sql", "utf8"));
  let entered!: () => void, release!: () => void; const held = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; }); const events: object[] = [];
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === "/hold") { entered(); await barrier; response.end("released"); return; }
      if (request.url !== "/rpc" || request.method !== "POST") { response.writeHead(404).end(); return; }
      let body = ""; for await (const chunk of request) { body += String(chunk); if (body.length > 65536) throw Error("PAYLOAD_LIMIT"); }
      const { name, args: a } = JSON.parse(body) as { name: string; args: Record<string, unknown> };
      const queries: Record<string, [string, unknown[]]> = {
        routing_lock: ["select routing_lock($1,$2,$3) as result", [a.p_tenant, a.p_token, a.p_release]],
        routing_history: ["select routing_history($1,$2) as result", [a.p_tenant, a.p_kind]],
        routing_append: ["select routing_append($1,$2,$3,$4) as result", [a.p_tenant, a.p_kind, JSON.stringify(a.p_document), a.p_token]],
      };
      if (!queries[name]) throw Error("RPC_REJECTED");
      const [sql, params] = queries[name]!, result = (await db.query<{ result: unknown }>(sql, params)).rows[0]!.result;
      events.push({ at: new Date().toISOString(), name, tenant: a.p_tenant, accepted: result === true });
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ result }));
    } catch { response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "TEST_SQL_RPC_FAILED" })); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address() as { port: number }, base = "http://127.0.0.1:" + address.port;
  const children: Array<{ role: string; pid?: number; exit: number | null; output: string }> = [];
  const run = (role: string) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "apps/portals/src/lib/geospatial/shared-process-client.test.ts"], { cwd: process.cwd(), env: { ...process.env, ROUTING_TEST_RPC_URL: base, ROUTING_TEST_CLIENT_ROLE: role }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const result = { role, pid: child.pid, exit: null as number | null, output: "" }; children.push(result); child.stdout.on("data", chunk => { result.output += String(chunk); }); child.stderr.on("data", chunk => { result.output += String(chunk); }); child.on("error", reject); child.on("exit", code => { result.exit = code; if (code === 0) resolve(); else reject(Error("Child " + role + " failed: " + result.output)); });
  });
  try {
    const holder = run("holder"); await Promise.race([held, holder.then(() => { throw Error("Holder finished before barrier"); })]);
    await run("contender"); release(); await holder; await run("after-release");
    const saved = (await db.query<{ result: unknown[] }>("select routing_history('deccan','settings') as result")).rows[0]!.result;
    expect(saved).toHaveLength(2); expect(children.every(c => c.exit === 0)).toBe(true); expect(new Set(children.map(c => c.pid)).size).toBe(3);
    if (process.env.ROUTING_BENCHMARK_DIR) await fs.writeFile(path.join(process.env.ROUTING_BENCHMARK_DIR, "shared-process-" + Date.now() + ".json"), JSON.stringify({ actualSqlEngine: "PGlite", transport: "isolated loopback RPC bridge", multiBackendPostgresVerified: false, children, events, savedVersions: saved.length }, null, 2), { flag: "wx" });
  } finally { release(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.close(); }
}, 45000);
