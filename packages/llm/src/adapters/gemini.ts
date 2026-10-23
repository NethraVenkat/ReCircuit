import type { LlmAdapter, ModelTier } from "../types.js";
import { LlmConfigurationError } from "../types.js";

/** Native Gemini REST adapter. Credentials remain in server-side headers. */
export class GeminiAdapter implements LlmAdapter {
  readonly provider = "gemini";
  get model(): string { return process.env.LLM_FAST_MODEL || ""; }
  private readonly apiKey: string;
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.LLM_API_KEY || "";
    if (!this.apiKey) throw new LlmConfigurationError("Missing Gemini API Key (LLM_API_KEY)");
  }

  async generate(options: { system: string; user: string; modelTier: ModelTier; timeoutMs: number; jsonSchema?: Record<string, unknown> }): Promise<string> {
    const model = (options.modelTier === "strong" ? process.env.LLM_STRONG_MODEL : process.env.LLM_FAST_MODEL) || "";
    if (!/^gemini-[a-zA-Z0-9.-]+$/.test(model)) throw new LlmConfigurationError("Gemini requires a valid LLM_FAST_MODEL or LLM_STRONG_MODEL model ID");
    let response: Response;
    const deadline = Date.now() + options.timeoutMs;
    const signal = AbortSignal.timeout(options.timeoutMs);
    try {
      for (let attempt = 0; ; attempt++) {
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
        }), signal,
      });
      if (![429, 502, 503, 504].includes(response.status) || attempt >= 2) break;
      const header = response.headers.get("Retry-After");
      const retryAfter = header ? (/^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
      const delay = Math.max(1000 * 2 ** attempt + Math.floor(Math.random() * 250), Number.isFinite(retryAfter) ? retryAfter : 0);
      if (Date.now() + delay + 1000 >= deadline) break;
      await response.body?.cancel();
      await new Promise<void>((resolve, reject) => {
        const done = (): void => { signal.removeEventListener("abort", abort); resolve(); };
        const timer = setTimeout(done, delay);
        const abort = (): void => { clearTimeout(timer); reject(new Error("timeout")); };
        signal.addEventListener("abort", abort, { once: true });
      });
      }
    } catch { throw new Error("Gemini request failed or timed out"); }
    if ([400, 401, 403, 404].includes(response.status)) throw new LlmConfigurationError(`Gemini API error HTTP ${response.status}; check provider credentials, model access and request schema.`);
    if (!response.ok) throw new Error(`Gemini API error HTTP ${response.status}${[429, 502, 503, 504].includes(response.status) ? "; temporary provider failure after bounded retries. Try refreshing policies later; no successful AI extraction is claimed." : ""}`);
    const data = await response.json() as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== "STOP") throw new Error("Gemini returned blocked, incomplete or missing output");
    const text = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") || "";
    if (!text.trim()) throw new Error("Gemini returned empty output");
    return text;
  }
}
