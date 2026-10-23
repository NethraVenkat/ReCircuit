import { afterEach, expect, it, vi } from "vitest";
import { providerRuntime } from "./provider-runtime";
afterEach(() => vi.unstubAllEnvs());
it("reports actual Groq model and explicit-provider precedence without leaking keys", () => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("LLM_PROVIDER", "groq"); vi.stubEnv("GROQ_API_KEY", "local-test-key-not-a-credential"); vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-20b");
  expect(providerRuntime()).toMatchObject({ provider: "groq", model: "openai/gpt-oss-20b", available: true });
  expect(JSON.stringify(providerRuntime())).not.toContain("local-test-key");
  vi.stubEnv("LLM_PROVIDER", "gemini"); vi.stubEnv("LLM_API_KEY", "local-test-gemini-key"); vi.stubEnv("LLM_FAST_MODEL", "historical-gemini-model");
  expect(providerRuntime()).toMatchObject({ provider: "gemini", selection: "Explicit LLM_PROVIDER" });
});
