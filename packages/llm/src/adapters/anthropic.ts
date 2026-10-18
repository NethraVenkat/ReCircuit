import type { LlmAdapter, ModelTier } from "../types.js";
import { LlmConfigurationError } from "../types.js";

export class AnthropicAdapter implements LlmAdapter {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.LLM_API_KEY || "";
    if (!this.apiKey) {
      throw new LlmConfigurationError("Missing Anthropic API Key (LLM_API_KEY)");
    }
  }

  async generate(options: {
    system: string;
    user: string;
    modelTier: ModelTier;
    timeoutMs: number;
  }): Promise<string> {
    const { system, user, modelTier, timeoutMs } = options;
    const defaultModel = modelTier === "strong" ? "claude-3-5-sonnet-20241022" : "claude-3-5-haiku-20241022";
    const model = (modelTier === "strong" ? process.env.LLM_STRONG_MODEL : process.env.LLM_FAST_MODEL) || defaultModel;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let attempt = 0;
      const maxRetries = 2;
      let response!: Response;

      while (attempt <= maxRetries) {
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            system,
            messages: [{ role: "user", content: user }],
            max_tokens: 1500,
            temperature: 0,
          }),
          signal: controller.signal,
        });

        if (response.status === 429 && attempt < maxRetries) {
          attempt++;
          const baseDelay = 1000 * Math.pow(2, attempt);
          const jitter = Math.floor(Math.random() * 500);
          await new Promise((res) => setTimeout(res, baseDelay + jitter));
          continue;
        }

        break;
      }

      if (!response.ok) {
        const status = response.status;
        throw new Error(`Anthropic API error HTTP ${status}`);
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };

      const textBlock = data.content?.find((c) => c.type === "text");
      return textBlock?.text || "";
    } finally {
      clearTimeout(timer);
    }
  }
}
