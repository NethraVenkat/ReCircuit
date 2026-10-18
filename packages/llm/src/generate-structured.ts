import { z } from "zod";
import type { GenerateStructuredOptions, LlmAdapter, LlmProvider } from "./types.js";
import { LlmOutputError } from "./types.js";
import { FakeLlmAdapter } from "./adapters/fake.js";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { OpenAiAdapter } from "./adapters/openai.js";

function getAdapter(provider?: string): LlmAdapter {
  const chosen = (provider || process.env.LLM_PROVIDER || "fake").toLowerCase() as LlmProvider;
  switch (chosen) {
    case "anthropic":
      return new AnthropicAdapter();
    case "openai":
      return new OpenAiAdapter();
    case "fake":
    default:
      return new FakeLlmAdapter();
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
  const { schema, system, user, modelTier = "fast", timeoutMs = 20000, testFixtureName } = options;
  const adapter = getAdapter();

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
        timeoutMs,
        ...(testFixtureName !== undefined ? { testFixtureName } : {}),
      });
      lastRawOutput = rawResponse;

      const cleaned = extractJsonString(rawResponse);
      const parsed: unknown = JSON.parse(cleaned);
      const validated: T = schema.parse(parsed);
      return validated;
    } catch (err: unknown) {
      lastError = err;

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
