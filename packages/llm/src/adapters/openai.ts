import type { LlmAdapter, ModelTier } from "../types.js";

export class OpenAiAdapter implements LlmAdapter {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.LLM_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("Missing OpenAI API Key (LLM_API_KEY)");
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
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
