import { afterEach, expect, it, vi } from "vitest";
import http from "node:http";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RoutingService, RoutingStore } from "./service";
import { syntheticBooking, syntheticInput, syntheticPreparation } from "./fixtures";
import { Verification } from "./contracts";
const holder = vi.hoisted(() => ({ service: null as RoutingService | null }));
vi.mock("./runtime.server", () => ({ routingService: () => holder.service! }));
import { GET, POST } from "../../app/api/routing/route";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("actual HTTP handler rejects corrupt saved evidence, streamed overflow and provider/write failures without leakage", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "routing-http-negative-")), store = new RoutingStore(directory), booking = syntheticBooking("synthetic-stop-000"), input = syntheticInput(1), provider = { configurationId: "http-test", matrix: async () => input.matrix };
  const service = new RoutingService({ list: async () => [booking], verification: async () => Verification.parse(syntheticPreparation(booking).verification) }, store, provider); holder.service = service;
  await service.vehicles("deccan", input.vehicles); await service.review("deccan", { bookingId: booking.id, coordinate: input.pickups[0]!.coordinate, serviceSeconds: 60, assumptionVersion: "HTTP synthetic" }, "synthetic-operator");
  const saved = await service.generate("deccan", "2026-10-24", randomUUID()), filename = path.join(directory, "deccan/proposals/00000001.json"), original = await fs.readFile(filename), before = JSON.stringify(booking);
  const server = http.createServer(async (incoming, outgoing) => {
    const url = "http://" + incoming.headers.host + incoming.url, headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) if (typeof value === "string") headers.set(name, value);
    const request = new Request(url, { method: incoming.method, headers, ...(incoming.method === "POST" ? { body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: "half" } : {}) } as RequestInit);
    const response = await (incoming.method === "POST" ? POST(request) : GET(request)); outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const base = "http://127.0.0.1:" + (server.address() as { port: number }).port, headers = { "x-admin-token": "unit-http-token", origin: base, "content-type": "application/json" };
  vi.stubEnv("ROUTING_ENABLED", "true"); vi.stubEnv("ADMIN_TOKEN", "unit-http-token"); vi.stubEnv("RECYCLER_ID", "deccan"); vi.stubEnv("ROUTING_ALLOWED_ORIGINS", base);
  const generate = () => fetch(base + "/api/routing", { method: "POST", headers, body: JSON.stringify({ action: "generate", payload: { serviceDate: "2026-10-24", requestKey: randomUUID() } }) });
  try {
    const corrupt = JSON.parse(original.toString()); corrupt.optimization.solution.metres++;
    await fs.writeFile(filename, JSON.stringify(corrupt)); const read = await fetch(base + "/api/routing?id=" + saved.id, { headers }); expect(read.status).toBe(400); expect((await read.json()).error).toBe("STORED_PROPOSAL_INVALID"); await fs.writeFile(filename, original);
    const payload = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(35000)); controller.enqueue(new Uint8Array(35000)); controller.close(); } });
    const oversized = await fetch(base + "/api/routing", { method: "POST", headers, body: payload, duplex: "half" } as RequestInit); expect(oversized.status).toBe(400); expect((await oversized.json()).error).toBe("PAYLOAD_LIMIT");
    const spy = vi.spyOn(provider, "matrix").mockRejectedValueOnce(Error("PRIVATE PROVIDER KEY AND ADDRESS")); const failed = await generate(); expect(failed.status).toBe(400); expect(await failed.text()).not.toMatch(/PRIVATE|stack|ADDRESS/); spy.mockRestore();
    const write = vi.spyOn(store, "append").mockRejectedValueOnce(Error("PRIVATE STORAGE PATH")); const unavailable = await generate(); expect(unavailable.status).toBe(400); expect(await unavailable.text()).not.toMatch(/PRIVATE|stack|PATH/); write.mockRestore();
    expect((await service.history("deccan")).length).toBe(1); expect(JSON.stringify(booking)).toBe(before); expect((await service.read("deccan", saved.id)).current).toBe(true);
  } finally { await fs.writeFile(filename, original); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
