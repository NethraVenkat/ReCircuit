import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { GroqAdapter } from "../adapters/groq.js";
import { generateStructured, getAdapter } from "../generate-structured.js";
const options = { system: "Return JSON", user: "Laptop", modelTier: "fast" as const, timeoutMs: 10000 };
const ok = (content = '{"quantity":1}'): Response => new Response(JSON.stringify({ model: "openai/gpt-oss-20b", choices: [{ finish_reason: "stop", message: { content } }] }));
beforeEach(() => { vi.stubEnv("LLM_PROVIDER", "groq"); vi.stubEnv("GROQ_API_KEY", "unit-only"); vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-20b"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("selects Groq, sends JSON schema and validates success", async () => {
  const f = vi.fn<typeof fetch>().mockResolvedValue(ok()); vi.stubGlobal("fetch", f);
  expect(getAdapter()).toBeInstanceOf(GroqAdapter);
  expect(await generateStructured({ ...options, schema: z.object({ quantity: z.number() }) })).toEqual({ quantity: 1 });
  const [url, request] = f.mock.calls[0]!; expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
  if (typeof request?.body !== "string") throw new Error("Expected JSON request body");
  const body = JSON.parse(request.body) as { response_format: { json_schema: { schema: { properties: { quantity: { type: string } } } } } };
  expect(body.response_format.json_schema.schema.properties.quantity.type).toBe("number");
});
it("prefers configured Groq but honors explicit Gemini rollback", () => {
  vi.stubEnv("LLM_PROVIDER", ""); expect(getAdapter()).toBeInstanceOf(GroqAdapter);
  vi.stubEnv("LLM_PROVIDER", "gemini"); vi.stubEnv("LLM_API_KEY", "unit-only"); expect(getAdapter().provider).toBe("gemini");
});
it("rejects invalid output after one repair attempt", async () => {
  const f = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(ok('{"quantity":"wrong"}'))); vi.stubGlobal("fetch", f);
  await expect(generateStructured({ ...options, schema: z.object({ quantity: z.number() }) })).rejects.toThrow("validation failed"); expect(f).toHaveBeenCalledTimes(2);
});
it.each([400, 401, 403, 404, 422])("stops on permanent HTTP %s without provider fallback", async status => {
  const f = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response('{}', { status }))); vi.stubGlobal("fetch", f);
  await expect(generateStructured({ ...options, schema: z.object({}) })).rejects.toThrow(`HTTP ${status}`); expect(f).toHaveBeenCalledTimes(1);
});
it("honors Retry-After and bounds 429 exhaustion across structured retries", async () => {
  vi.useFakeTimers(); const f = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response('{}', { status: 429, headers: { "Retry-After": "2" } }))); vi.stubGlobal("fetch", f);
  const pending = expect(generateStructured({ ...options, schema: z.object({}) })).rejects.toThrow("429");
  await vi.advanceTimersByTimeAsync(1999); expect(f).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2001); await pending; expect(f).toHaveBeenCalledTimes(3);
});
it("does not retry past the shared deadline", async () => {
  const f = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 429, headers: { "Retry-After": "60" } })); vi.stubGlobal("fetch", f);
  await expect(new GroqAdapter().generate({ ...options, timeoutMs: 10 })).rejects.toThrow("deadline insufficient"); expect(f).toHaveBeenCalledTimes(1);
});
it("aborts a timed out fetch without a new attempt", async () => {
  const f = vi.fn<typeof fetch>((_url, request) => new Promise<Response>((_resolve, reject) => request?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))); vi.stubGlobal("fetch", f);
  await expect(generateStructured({ ...options, timeoutMs: 20, schema: z.object({}) })).rejects.toThrow("timed out"); expect(f).toHaveBeenCalledTimes(1);
});
it("rejects refusal and incomplete output", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{}' } }] }))));
  await expect(new GroqAdapter().generate(options)).rejects.toThrow("incomplete");
});
