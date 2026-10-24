import type { z } from "zod";

export type ModelTier = "fast" | "strong";
export type LlmProvider = "anthropic" | "openai" | "gemini" | "groq" | "fake";

export interface GenerateStructuredOptions<T> {
  schema: z.ZodType<T, unknown>;
  system: string;
  user: string;
  modelTier?: ModelTier;
  timeoutMs?: number;
  testFixtureName?: string;
}

export class LlmOutputError extends Error {
  readonly isLlmOutputError = true;
  constructor(
    message: string,
    public override readonly cause?: unknown,
    public readonly rawOutput?: string
  ) {
    super(message);
    this.name = "LlmOutputError";
  }
}

export class LlmConfigurationError extends Error {
  readonly isLlmConfigurationError = true;
  constructor(message: string) {
    super(message);
    this.name = "LlmConfigurationError";
  }
}

export interface LlmAdapter {
  readonly provider?: string;
  readonly model?: string;
  generate(options: {
    system: string;
    user: string;
    modelTier: ModelTier;
    timeoutMs: number;
    testFixtureName?: string;
    jsonSchema?: Record<string, unknown>;
  }): Promise<string>;
}
