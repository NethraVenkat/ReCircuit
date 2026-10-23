/** Server only. Validate names, never echo values or authenticated URLs. */
export function assertProductionConfiguration(): void {
  if (process.env.NODE_ENV !== "production") return;
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID", "LLM_API_KEY", "LLM_FAST_MODEL", "LLM_STRONG_MODEL", "PORTAL_DECCAN_URL", "PORTAL_PAPERPLUS_URL", "PORTAL_QUICKSCRAP_URL"];
  const missing = required.filter(k => !process.env[k]?.trim());
  if (missing.length) throw new Error(`PERSISTENCE_UNAVAILABLE: Missing configuration: ${missing.join(", ")}`);
  if (!["openai", "anthropic", "gemini"].includes(process.env.LLM_PROVIDER || "")) throw new Error("CONFIGURATION_ERROR: LLM_PROVIDER must select a real provider (openai, anthropic or gemini).");
  if (process.env.BROWSER_MODE !== "browserbase") throw new Error("CONFIGURATION_ERROR: BROWSER_MODE must be browserbase in production.");
  if (process.env.RECIRCUIT_PERSISTENCE === "local") throw new Error("PERSISTENCE_UNAVAILABLE: Local persistence disabled in production.");
  for (const key of ["PORTAL_DECCAN_URL", "PORTAL_PAPERPLUS_URL", "PORTAL_QUICKSCRAP_URL"]) {
    let valid = false;
    try { const url = new URL(process.env[key]!); valid = url.protocol === "https:" && !url.username && !url.password && !/^(localhost|127\.|\[::1\])/.test(url.hostname); } catch { /* invalid */ }
    if (!valid) throw new Error(`CONFIGURATION_ERROR: ${key} must be a public HTTPS URL.`);
  }
}
