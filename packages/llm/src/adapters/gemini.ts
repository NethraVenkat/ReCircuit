import type { LlmAdapter, ModelTier } from "../types.js";
import { LlmConfigurationError } from "../types.js";

/** Native Gemini REST adapter. Credentials remain in server-side headers. */
export class GeminiAdapter implements LlmAdapter {
  private readonly apiKey: string;
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.LLM_API_KEY || "";
    if (!this.apiKey) throw new LlmConfigurationError("Missing Gemini API Key (LLM_API_KEY)");
  }

  async generate(options: { system: string; user: string; modelTier: ModelTier; timeoutMs: number; jsonSchema?: Record<string, unknown> }): Promise<string> {
    const model = (options.modelTier === "strong" ? process.env.LLM_STRONG_MODEL : process.env.LLM_FAST_MODEL) || "";
    if (!/^gemini-[a-zA-Z0-9.-]+$/.test(model)) throw new LlmConfigurationError("Gemini requires a valid LLM_FAST_MODEL or LLM_STRONG_MODEL model ID");
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: options.system }] },
          contents: [{ role: "user", parts: [{ text: options.user }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192,
            ...(/^gemini-2\./.test(model) ? { temperature: 0 } : {}),
            ...(/^gemini-3\./.test(model) ? { thinkingConfig: { thinkingLevel: "LOW" } } : {}),
            ...(options.jsonSchema ? { responseJsonSchema: options.jsonSchema } : {}),
          },
        }), signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch { throw new Error("Gemini request failed or timed out"); }
    if (!response.ok) throw new Error(`Gemini API error HTTP ${response.status}`);
    const data = await response.json() as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== "STOP") throw new Error("Gemini returned blocked, incomplete or missing output");
    const text = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") || "";
    if (!text.trim()) throw new Error("Gemini returned empty output");
    return text;
  }
}
