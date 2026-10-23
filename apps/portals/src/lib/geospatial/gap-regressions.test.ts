import { afterEach, expect, it, vi } from "vitest";
import os from "node:os";
import { geometryFollowsOrder } from "./geometry";
import { compare } from "./validator";
import { optimize } from "./optimizer";
import { syntheticInput } from "./fixtures";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("does not conflate different served sets whose IDs contain delimiters", () => {
  const calculation = optimize(syntheticInput(2)).solution, first = structuredClone(calculation), second = structuredClone(calculation);
  first.routes[0]!.pickupIds = ["a|b", "c"]; second.routes[0]!.pickupIds = ["a", "b|c"];
  expect(compare(first, second).comparable).toBe(false);
});
it("rejects reversed or unrelated road geometry while accepting requested vertex order", () => {
  const stops = [{ lon: 0, lat: 0 }, { lon: 0.1, lat: 0 }, { lon: 0.2, lat: 0 }, { lon: 0, lat: 0 }];
  expect(geometryFollowsOrder([[0, 0], [0.1, 0], [0.2, 0], [0, 0]], stops)).toBe(true);
  expect(geometryFollowsOrder([[0, 0], [0.2, 0], [0.1, 0], [0, 0]], stops)).toBe(false);
  expect(geometryFollowsOrder([[50, 20], [51, 21]], stops)).toBe(false);
});
it.each(["ROUTING_MATRIX_PROVIDER", "ROUTING_GEOCODER_PROVIDER"])("rejects invalid %s instead of silently selecting fixtures", async name => {
  vi.resetModules(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("RECIRCUIT_PERSISTENCE", "local"); vi.stubEnv("ROUTING_DATA_DIR", os.tmpdir()); vi.stubEnv("ROUTING_HOUSEHOLD_EVIDENCE_DIR", os.tmpdir()); vi.stubEnv(name, "invalid-provider");
  const { routingService } = await import("./runtime.server"); expect(() => routingService()).toThrow("PROVIDER_CONFIGURATION_REQUIRED");
});
it("keeps shared preparation restricted to explicit loopback tests and never enables production", async () => {
  vi.resetModules(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("RECIRCUIT_PERSISTENCE", "local"); vi.stubEnv("ROUTING_DATA_DIR", os.tmpdir()); vi.stubEnv("ROUTING_HOUSEHOLD_EVIDENCE_DIR", os.tmpdir()); vi.stubEnv("ROUTING_STORE_BACKEND", "supabase-local-test"); vi.stubEnv("ROUTING_SHARED_TEST_MODE", "true"); vi.stubEnv("SUPABASE_URL", "https://production.invalid");
  const { routingService } = await import("./runtime.server"); expect(() => routingService()).toThrow("SHARED_LOCAL_TEST_CONFIGURATION_REQUIRED");
  vi.stubEnv("NODE_ENV", "production"); expect(() => routingService()).toThrow("LOCAL_PREVIEW_ONLY");
});
