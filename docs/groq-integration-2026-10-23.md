# Groq primary-provider integration — 23 October 2026

Feature branch: `feature/groq-primary`, based on `28a2ebb2073ee2bae18dab0a102ef1dc49ae50f1`. No AGENTS.md was found in the workspace or its immediate parent. The existing modified submission report was preserved and excluded from this implementation commit. Historical evidence and DEC-46179 were not modified. No push, deployment or Vercel setting change.

## Implementation

- Server-side Groq Chat Completions REST adapter: fixed HTTPS endpoint, private Authorization header, GROQ_API_KEY and GROQ_MODEL. Default model `openai/gpt-oss-20b`, documented as JSON Schema capable in [Groq structured outputs](https://console.groq.com/docs/structured-outputs) (checked 23 October 2026).
- JSON Schema best-effort (`strict: false`) preserves optional fields in existing contracts. Zod output validation and worker verbatim-source/numeric checks remain mandatory. This is not a claim of provider-enforced strict schema guarantees.
- Explicit LLM_PROVIDER selection wins; otherwise a configured Groq key selects Groq. Gemini remains available through explicit rollback configuration. No cross-provider fallback. The inspected root file has LLM_PROVIDER and GROQ_MODEL unset; the new code therefore selects Groq/default model when that key is loaded. Existing running/deployed processes are not reconfigured by this task.
- At most three HTTP attempts, Retry-After seconds/date support, exponential waits and one shared deadline. Authentication/model/schema configuration errors terminate retries. JSON/schema/source correction attempts share the outer deadline; exhausted HTTP retries are not restarted by the worker or structured wrapper.
- Worker policy evidence retains llmProvider/llmModel alongside extractionPath. DOM fallback remains labelled dom-fallback and does not establish successful AI extraction. Existing policy retrieval timestamps, expiry logic, quote checks, approval/ownership/booking guards and independent-verifier logic were preserved.
- Inspected application/package/script Gemini references: native REST adapter is centralized behind getAdapter; worker policy extraction also calls that factory, now sends JSON Schema and records Groq/Gemini metadata. No independent hidden Gemini client was found. Local fixture scripts still explicitly select fake for tests.

## Actual validation

| Check | Actual result | Exit |
|---|---|---|
| Focused adapter, worker and production-config tests | 6 files, 42 tests passed; success, invalid output, unsupported claims, timeout, Retry-After/429 exhaustion, permanent errors, rollback and Groq production configuration | 0 |
| Repository lint | Passed | 0 |
| Repository typecheck | Passed | 0 |
| Household production build (including llm/core/db) | Passed | 0 |
| Worker TypeScript production build | Passed | 0 |
| Live public Deccan policy extraction through actual worker | SUCCESS / generic-ai / groq / openai/gpt-oss-20b; schema and quote validation passed | 0 |

Live check started at `2026-10-23T13:07:14.542Z` (18:37:14 IST). It explicitly reloaded root .env.local privately, selected Groq in its own process, visited public policy pages using local Chromium with all non-GET/HEAD/OPTIONS requests blocked, and saved local screenshots and extracted evidence. It did not use fixtures, fake output, DOM fallback, Supabase writes or a booking. Browser/context closed. This validates live Groq extraction, not deployed configuration or a new official TC1–TC4 run.

Evidence directory: `.data/groq-integration-20261023/`. Principal evidence: live.ts, live.json, live.log, live.exit, deccan-page-*.png, tests-validated.log/exit, lint-validated.log/exit, typecheck-validated.log/exit, build-household.log/exit, build-worker.log/exit, secret-scan.json and final-state.json.

Initial failures were diagnosed before retries: sandbox esbuild directory denial prevented test startup (exit 1; approved unsandboxed run succeeded); typecheck found a test tuple possibly undefined (exit 2; fixed); lint found unsafe test/converter typings (exit 1; fixed). Original failed logs remain. No dependency audit remediation was attempted; npm reported six repository dependency vulnerabilities during installation (3 moderate, 1 high, 2 critical), which are outside this provider change and remain unresolved. No integration blocker remains; production rollout still requires operator configuration and deployment, neither performed here.
