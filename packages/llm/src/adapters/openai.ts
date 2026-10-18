import type { LlmAdapter, ModelTier } from "../types.js";
import { LlmConfigurationError } from "../types.js";

export class OpenAiAdapter implements LlmAdapter {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.LLM_API_KEY || "";
    if (!this.apiKey) {
      throw new LlmConfigurationError("Missing OpenAI API Key (LLM_API_KEY)");
    }
  }

  async generate(options: {
    system: string;
    user: string;
    modelTier: ModelTier;
    timeoutMs: number;
  }): Promise<string> {
    const { system, user, modelTier, timeoutMs } = options;
    const defaultModel = modelTier === "strong" ? "gpt-4o" : "gpt-4o-mini";
    const model = (modelTier === "strong" ? process.env.LLM_STRONG_MODEL : process.env.LLM_FAST_MODEL) || defaultModel;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let attempt = 0;
      const maxRetries = 2;
      let response!: Response;

      while (attempt <= maxRetries) {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
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
        throw new Error(`OpenAI API error HTTP ${status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      return data.choices?.[0]?.message?.content || "";
    } finally {
      clearTimeout(timer);
    }
  }
}
