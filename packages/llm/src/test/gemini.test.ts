import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiAdapter } from "../adapters/gemini.js";
import { getAdapter, generateStructured } from "../generate-structured.js";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("LLM_API_KEY", "private-unit-key"); vi.stubEnv("LLM_FAST_MODEL", "gemini-3.8-flash"); vi.stubEnv("LLM_STRONG_MODEL", "gemini-3.8-flash");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const options = { system: "Extract JSON only", user: "Synthetic: one laptop", modelTier: "fast" as const, timeoutMs: 1000 };
it("selects Gemini and validates structured output through the existing application contract", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"quantity":1}' }] } }] })));
  vi.stubGlobal("fetch", fetchMock);
  expect(getAdapter()).toBeInstanceOf(GeminiAdapter);
  expect(await generateStructured({ ...options, schema: z.object({ quantity: z.number().int().positive() }) })).toEqual({ quantity: 1 });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  expect(url).not.toContain("private-unit-key");
  const body = JSON.parse(init!.body as string) as { generationConfig: Record<string, unknown> };
  expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "LOW" } });
  expect(body.generationConfig).not.toHaveProperty("temperature");
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("passes an optional native output schema and ignores thought text", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "internal" }, { text: '{"quantity":1}' }] } }] })));
  vi.stubGlobal("fetch", fetchMock);
  const jsonSchema = { type: "object" };
  expect(await new GeminiAdapter().generate({ ...options, jsonSchema })).toBe('{"quantity":1}');
  const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { generationConfig: { responseJsonSchema: unknown } };
  expect(body.generationConfig.responseJsonSchema).toEqual(jsonSchema);
});
it("fails explicitly for HTTP errors and incomplete output without fake fallback or raw error disclosure", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("private-upstream-error", { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] })));
  vi.stubGlobal("fetch", fetchMock);
  await expect(getAdapter().generate(options)).rejects.toThrow("Gemini API error HTTP 429");
  await expect(getAdapter().generate(options)).rejects.toThrow("incomplete");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("requires a key and rejects invalid model paths before a network call", async () => {
  vi.stubEnv("LLM_API_KEY", ""); expect(() => new GeminiAdapter()).toThrow("LLM_API_KEY");
  vi.stubEnv("LLM_FAST_MODEL", "../invalid");
  await expect(new GeminiAdapter("test-only").generate(options)).rejects.toThrow("model ID");
});
