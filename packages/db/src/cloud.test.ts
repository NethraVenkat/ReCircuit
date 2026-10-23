import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseHouseholdRepository, cloudRequest, cloudConfigured } from "./cloud.js";
import { FileRepository, PgRepository, getRepository } from "./index.js";

describe("cloud error boundaries", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("fails closed for missing configuration", async () => {
    vi.stubEnv("SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(new SupabaseHouseholdRepository().getRequest("missing")).rejects.toThrow("CONFIGURATION_MISSING");
  });
  it("refuses every local persistence fallback in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("RECIRCUIT_PERSISTENCE", "");
    expect(() => getRepository()).toThrow("CONFIGURATION_MISSING");
    expect(() => new FileRepository()).toThrow("FILE_REPOSITORY_DISABLED");
    expect(() => new PgRepository()).toThrow("PGLITE_DISABLED");
    vi.stubEnv("RECIRCUIT_PERSISTENCE", "local");
    expect(() => cloudConfigured()).toThrow("LOCAL_MODE_DISABLED_IN_PRODUCTION");
  });
  it("does not turn network or database errors into missing records or expose response secrets", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.test"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private connection details")));
    await expect(new SupabaseHouseholdRepository().getRequest("missing")).rejects.toThrow("PERSISTENCE_UNAVAILABLE: NETWORK");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "42501", message: "private secret" }), { status: 403 })));
    await expect(cloudRequest("/rest/v1/household_records")).rejects.toThrow("PERSISTENCE_UNAVAILABLE: 42501");
  });
});
