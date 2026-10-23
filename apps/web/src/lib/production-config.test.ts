import { afterEach, expect, it, vi } from "vitest";
import { assertProductionConfiguration } from "./production-config";
import { getAdapter } from "@recircuit/llm";
afterEach(() => vi.unstubAllEnvs());
function configure() {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("BROWSER_MODE", "browserbase"); vi.stubEnv("LLM_PROVIDER", "openai");
  vi.stubEnv("RECIRCUIT_PERSISTENCE", "");
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID", "LLM_API_KEY", "LLM_FAST_MODEL", "LLM_STRONG_MODEL"]) vi.stubEnv(key, "test-only");
  for (const id of ["DECCAN", "PAPERPLUS", "QUICKSCRAP"]) vi.stubEnv(`PORTAL_${id}_URL`, `https://${id.toLowerCase()}.example.test`);
}
it("requires public URLs, a real LLM and cloud browser configuration", () => {
  configure(); expect(() => assertProductionConfiguration()).not.toThrow();
  vi.stubEnv("LLM_PROVIDER", "fake"); expect(() => assertProductionConfiguration()).toThrow("real provider");
  expect(() => getAdapter()).toThrow("fake is disabled");
  vi.stubEnv("LLM_PROVIDER", "openai"); vi.stubEnv("PORTAL_DECCAN_URL", "http://localhost:3101");
  expect(() => assertProductionConfiguration()).toThrow("PORTAL_DECCAN_URL");
});
it("reports missing variable names and blocks missing model credentials", () => {
  configure(); vi.stubEnv("LLM_API_KEY", "");
  expect(() => assertProductionConfiguration()).toThrow("LLM_API_KEY");
  expect(() => getAdapter()).toThrow("LLM_API_KEY");
});
it("accepts Groq in production without legacy Gemini variables and fails clearly without its key", () => {
  configure(); vi.stubEnv("LLM_PROVIDER", "groq"); vi.stubEnv("GROQ_API_KEY", "unit-only");
  for (const key of ["LLM_API_KEY", "LLM_FAST_MODEL", "LLM_STRONG_MODEL"]) vi.stubEnv(key, "");
  expect(() => assertProductionConfiguration()).not.toThrow();
  expect(getAdapter().provider).toBe("groq");
  vi.stubEnv("GROQ_API_KEY", ""); expect(() => assertProductionConfiguration()).toThrow("GROQ_API_KEY");
  expect(() => getAdapter()).toThrow("GROQ_API_KEY");
});
