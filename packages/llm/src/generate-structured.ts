import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import type { GenerateStructuredOptions, LlmAdapter, LlmProvider } from "./types.js";
import { LlmOutputError, LlmConfigurationError } from "./types.js";
import { FakeLlmAdapter } from "./adapters/fake.js";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { OpenAiAdapter } from "./adapters/openai.js";
import { GeminiAdapter } from "./adapters/gemini.js";

import { GroqAdapter } from "./adapters/groq.js";
export function selectedProvider(): string {
  return (process.env.LLM_PROVIDER || (process.env.GROQ_API_KEY?.trim() ? "groq" : "fake")).toLowerCase();
}
export function structuredSchema(schema: z.ZodType<unknown, z.ZodTypeDef, unknown>): Record<string, unknown> {
  return zodToJsonSchema(schema, { $refStrategy: "none" });
}
export function getAdapter(provider?: string): LlmAdapter {
  const chosen = (provider || selectedProvider()).toLowerCase() as LlmProvider;
  if (process.env.NODE_ENV === "production") {
    if (!["openai", "anthropic", "gemini", "groq"].includes(chosen)) throw new LlmConfigurationError("Production requires LLM_PROVIDER=openai, anthropic, gemini or groq; fake is disabled.");
    const missing = (chosen === "groq" ? ["GROQ_API_KEY"] : ["LLM_API_KEY", "LLM_FAST_MODEL", "LLM_STRONG_MODEL"]).filter(k => !process.env[k]?.trim());
    if (missing.length) throw new LlmConfigurationError(`Missing production configuration: ${missing.join(", ")}`);
  }
  switch (chosen) {
    case "groq":
      return new GroqAdapter();
    case "gemini":
      return new GeminiAdapter();
    case "anthropic":
      return new AnthropicAdapter();
    case "openai":
      return new OpenAiAdapter();
    case "fake":
      return new FakeLlmAdapter();
    default:
      throw new LlmConfigurationError("Unsupported LLM_PROVIDER");
  }
}

/**
 * Extracts raw JSON from an LLM response string, stripping any surrounding markdown code fences.
 */
function extractJsonString(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

export async function generateStructured<T>(
  options: GenerateStructuredOptions<T>
): Promise<T> {
  const { schema, system, user, modelTier = "fast", timeoutMs = process.env.LLM_PROVIDER === "gemini" ? 45000 : 20000, testFixtureName } = options;
  const adapter = getAdapter();

  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let currentUserPrompt = user;
  let lastRawOutput = "";
  let lastError: unknown;

  while (attempt < 2) {
    attempt++;
    let rawResponse = "";

    try {
      rawResponse = await adapter.generate({
        system,
        user: currentUserPrompt,
        modelTier,
        timeoutMs: Math.max(1, deadline - Date.now()),
        jsonSchema: structuredSchema(schema),
        ...(testFixtureName !== undefined ? { testFixtureName } : {}),
      });
      lastRawOutput = rawResponse;

      const cleaned = extractJsonString(rawResponse);
      const parsed: unknown = JSON.parse(cleaned);
      const validated: T = schema.parse(parsed);
      return validated;
    } catch (err: unknown) {
      if (err instanceof LlmConfigurationError) throw err;
      lastError = err;

      if (!(err instanceof z.ZodError || err instanceof SyntaxError) || Date.now() >= deadline) throw err;
      if (attempt === 1) {
        // Build error explanation to append for retry
        let errorDesc = "Invalid JSON or schema validation failure.";
        if (err instanceof z.ZodError) {
          errorDesc = `Validation error: ${JSON.stringify(err.errors)}`;
        } else if (err instanceof SyntaxError) {
          errorDesc = `Invalid JSON syntax: ${err.message}`;
        }

        currentUserPrompt = `${user}\n\n[Previous attempt failed with error: ${errorDesc}. Please output ONLY valid JSON adhering strictly to the schema.]`;
        continue;
      }
    }
  }

  throw new LlmOutputError(
    `Structured LLM output validation failed after 2 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    lastError,
    lastRawOutput
  );
}
