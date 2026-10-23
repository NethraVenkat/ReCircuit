import { getAdapter, selectedProvider } from "@recircuit/llm";
/** Read the same provider selection path used by extraction; never infer history from this. */
export function providerRuntime(): { provider: string; model: string | null; selection: string; available: boolean } {
  const provider = selectedProvider();
  const selection = process.env.LLM_PROVIDER ? "Explicit LLM_PROVIDER" : process.env.GROQ_API_KEY?.trim() ? "Groq credential default" : "Local test default";
  try { const adapter = getAdapter(); return { provider: adapter.provider || provider, model: adapter.model || null, selection, available: true }; }
  catch { return { provider, model: null, selection, available: false }; }
}
