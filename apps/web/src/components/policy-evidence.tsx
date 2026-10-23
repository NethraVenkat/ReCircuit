"use client";
import { useEffect, useState } from "react";
import { api, time } from "./ui";
import { policyPresentation, type PolicyView } from "../lib/policy-presentation";
import { safeDiagnostic } from "../lib/error-display";
function safeUrl(value: string): string | undefined { try { const url = new URL(value); if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) { url.search = ""; url.hash = ""; return url.href; } } catch { /* Untrusted stored URL. */ } return undefined; }
export function RuntimeProvider() {
  const [runtime, setRuntime] = useState<{ provider: string; model: string | null; selection: string; available: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; void api("/api/runtime").then(value => { if (active) setRuntime(value); }).catch(() => { if (active) setFailed(true); }); return () => { active = false; }; }, []);
  return <section className="rc-runtime"><h3>Current server configuration</h3>
    <p>{runtime ? <><strong>{runtime.provider}</strong> · {runtime.model || "Model not reported"}{!runtime.available && " · Configuration unavailable"}</> : failed ? "Current configuration could not be read." : "Reading current configuration…"}</p>
    <p className="rc-secondary">This is the provider selected now. Each source below retains its own recorded provider and model; older evidence is not relabelled.</p>
    {runtime && <details><summary>Provider selection</summary><p>{runtime.selection}. An explicit LLM_PROVIDER takes precedence over the Groq credential default.</p></details>}
  </section>;
}
export function PolicyEvidence({ policy }: { policy: PolicyView }) {
  const view = policyPresentation(policy); const href = safeUrl(policy.url);
  return <section className="rc-source-card">
    <div className="rc-item-head"><h3>{policy.name}</h3><span className={`rc-badge rc-badge--${view.tone}`}>{view.source}</span></div>
    {href && <a className="rc-source-url" href={href} target="_blank" rel="noopener noreferrer">{href}<span className="sr-only"> (opens a new tab)</span></a>}
    <dl className="rc-source-facts"><div><dt>Extraction result</dt><dd>{view.method}</dd></div><div><dt>Evidence freshness</dt><dd>{view.freshness}</dd></div><div><dt>Retrieved</dt><dd>{policy.retrievedAt ? time(policy.retrievedAt) : "Not recorded"}</dd></div><div><dt>Fresh until</dt><dd>{policy.expiresAt ? time(policy.expiresAt) : "Not recorded"}</dd></div><div><dt>Recorded AI provider / model</dt><dd>{policy.llmProvider || "Not recorded"} / {policy.llmModel || "Not recorded"}</dd></div></dl>
    {policy.extractionPath === "dom-fallback" && <p className="rc-secondary">The accepted extraction came from DOM fallback. A recorded AI provider does not mean AI extraction succeeded.</p>}
    {policy.llmAttempted === false && <p className="rc-secondary">AI was not called for this retrieval; any recorded provider identifies its configuration only.</p>}
    {policy.failureReason && <div className="rc-notice rc-warning"><p><strong>{policy.expired ? "Refresh failed; showing earlier evidence." : "No usable extraction was verified for this source."}</strong></p><details className="rc-diagnostics"><summary>Extraction diagnostics</summary><pre>{safeDiagnostic(policy.failureReason)}</pre></details></div>}
    {policy.quotes.length ? <details className="rc-policy-quotes"><summary>Policy quotes ({policy.quotes.length})</summary><ul>{policy.quotes.map((quote, i) => <li key={i}>{quote}</li>)}</ul></details> : <p className="rc-secondary">No supporting policy quotes were saved.</p>}
    <details className="rc-diagnostics"><summary>Recorded source metadata</summary><dl><dt>Source status</dt><dd>{policy.status}</dd><dt>Extraction path</dt><dd>{policy.extractionPath || "Not recorded"}</dd><dt>Cache</dt><dd>{policy.cached ? "Cached" : "Not cached"}</dd></dl></details>
  </section>;
}
