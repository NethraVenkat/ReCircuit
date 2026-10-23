import type { LlmAdapter } from "../types.js";
import { LlmConfigurationError } from "../types.js";

/** Server-side Groq REST API. Never log headers or provider error bodies. */
export class GroqAdapter implements LlmAdapter {
  readonly provider = "groq";
  readonly model: string;
  private readonly apiKey: string;
  constructor(apiKey = process.env.GROQ_API_KEY || "", model = process.env.GROQ_MODEL || "openai/gpt-oss-20b") {
    this.apiKey = apiKey.trim();
    this.model = model.trim();
    if (!this.apiKey) throw new LlmConfigurationError("Missing GROQ_API_KEY");
    if (!/^[a-zA-Z0-9/._-]+$/.test(this.model)) throw new LlmConfigurationError("Invalid GROQ_MODEL");
  }
  async generate(options: Parameters<LlmAdapter["generate"]>[0]): Promise<string> {
    const deadline = Date.now() + options.timeoutMs;
    const signal = AbortSignal.timeout(Math.max(1, options.timeoutMs));
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", signal,
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.model, temperature: 0, max_completion_tokens: 8192,
            messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
            response_format: options.jsonSchema ? { type: "json_schema", json_schema: { name: "recircuit", strict: false, schema: options.jsonSchema } } : { type: "json_object" },
          }),
        });
        if ([400, 401, 403, 404, 422].includes(response.status)) {
          await response.body?.cancel();
          throw new LlmConfigurationError(`Groq API HTTP ${response.status}; check GROQ_API_KEY, GROQ_MODEL and schema support.`);
        }
        if (!response.ok) {
          const header = response.headers.get("Retry-After");
          const retryAfter = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
          const delay = Math.max(1000 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter : 0);
          await response.body?.cancel();
          if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2 || Date.now() + delay >= deadline) throw new Error(`Groq API HTTP ${response.status}; bounded retries exhausted or deadline insufficient`);
          await new Promise<void>((resolve, reject) => {
            const abort = (): void => { clearTimeout(timer); reject(new Error("Groq deadline exceeded")); };
            const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, delay);
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort();
          });
          continue;
        }
        const data = await response.json() as { model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string } }> };
        const choice = data.choices?.[0];
        if (data.model && data.model !== this.model) throw new Error("Groq returned an unexpected model");
        if (choice?.finish_reason !== "stop" || choice.message?.refusal || !choice.message?.content?.trim()) throw new Error("Groq returned refused, incomplete or empty output");
        return choice.message.content;
      }
      throw new Error("Groq retries exhausted");
    } catch (error) {
      if (error instanceof LlmConfigurationError) throw error;
      if (signal.aborted) throw new Error("Groq request timed out within shared deadline");
      throw error;
    }
  }
}
