# Public jury deployment

Prepared 23 October 2026. No deployment has been performed. Use the existing Supabase project; migrations 0001–0006 are already applied. Do not reset, seed or reapply them.

## Deployment blockers

Missing deployment values: `PORTAL_DECCAN_URL`, `PORTAL_PAPERPLUS_URL`, `PORTAL_QUICKSCRAP_URL`. These are supplied after the three portal projects receive public URLs. The root file is not automatically uploaded to hosting. Root `CAPTCHA_SECRET` and `ADMIN_TOKEN` were replaced privately with random production values after they matched committed development fixtures. Use the new values in hosting; existing development processes need a restart to load them.

The new Gemini key was reloaded explicitly from private root `.env.local`. Configuration is `LLM_PROVIDER=gemini`, `LLM_FAST_MODEL=gemini-3.8-flash`, `LLM_STRONG_MODEL=gemini-3.8-flash`, plus private `LLM_API_KEY`. Both tiers use the same actually tested model. Native Gemini generateContent JSON output, optional JSON Schema, and local Zod validation are supported. One successful synthetic extraction returned HTTP 200 in 17.9 seconds and passed schema and semantic checks. The initial Gemini 2.5 Flash attempt returned HTTP 404; Google's current documentation restricts 2.5 access to prior users. Its failure evidence is retained. No fake fallback ran. Gemini policy/intake timeouts allow 45 seconds per attempt, since the observed small extraction exceeded the old policy timeout of 15 seconds.

Browserbase project inspection succeeds, with concurrency 25. A blank keep-alive session was created, disconnected, reconnected to the same session/page, and released successfully using existing credits. No portal was opened, no booking submitted and no evidence uploaded by that probe. The account's keep-alive support is verified; no paid plan or resource was created. This does not certify an end-to-end cloud booking, which is excluded from preparation.

## Selected topology

Four **Vercel Hobby** Next.js projects, one household URL shared with the jury. The three portal URLs are used by the server-side browser agent. This assumes a personal, non-commercial jury demonstration eligible for Hobby. No separate worker service, cron or owner's laptop is required: `/api/plan`, `/api/book`, `/api/verify` execute inline in Node functions. The `apps/worker` package is imported into household functions. The durable job queue exists but these HTTP paths do not enqueue jobs.

Vercel Fluid Compute Hobby currently permits 300 seconds per invocation and 2 GB / 1 vCPU; the uncompressed function bundle limit is 250 MB. Cold starts and quota exhaustion remain possible; Hobby pauses at its free limits. This is not an always-running worker. Set Fluid Compute on the project, as well as the checked-in `fluid: true`. Browserbase supplies Chromium; do not install/download a local browser.

The active browser controller has a 240-second deadline. One booking invocation handles one leg. For CAPTCHA, it persists a handoff and disconnects from the Browserbase keep-alive session. The human reads a private screenshot and enters the code in the household UI; a later invocation reconnects to the stored page. The UI offers a ten-minute handoff window, bounded by the remote session's fifteen-minute absolute lifetime and the original policy expiry. CAPTCHA solving, recording and logs are explicitly disabled in Browserbase session settings. No application server waits on stdin or an indefinite human pause.

Database locks, revisions and action reservations remain authoritative. A killed function can leave a durable lock or an uncertain `SUBMITTING` state. Do not remove locks or submit a replacement request automatically: reconcile the portal tracking record and saved action evidence first. This favors preventing duplicate side effects over automatic recovery after an unknown outcome.

## Exact services and order

All projects use Node **24.x**, Next.js preset, and “Include source files outside of the Root Directory in the Build Step”. Install command for each: `cd ../.. && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --include=dev`. Build commands below are relative to the Vercel project root. Vercel manages the function runtime; it does not execute a persistent start command. The listed start commands are equivalent local/container production commands from repository root and honor `PORT`.

| Order | Service | Provider / plan | Repository root directory | Build command | Start command | Server environment | Health |
|---|---|---|---|---|---|---|---|
| 1 | Deccan E-Cycle Solutions | Vercel / Hobby | `apps/portals` | `cd ../.. && npm run build:portals` | managed; equivalent `npm run start --workspace=@recircuit/portals` | `NODE_ENV=production`, `RECYCLER_ID=deccan`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CAPTCHA_SECRET`, `ADMIN_TOKEN` | `/api/health` |
| 2 | PaperPlus Kabadi | Vercel / Hobby | `apps/portals` | same | same | same, `RECYCLER_ID=paperplus` | `/api/health` |
| 3 | QuickScrap Hyd | Vercel / Hobby | `apps/portals` | same | same | same, `RECYCLER_ID=quickscrap` | `/api/health` |
| 4 | ReCircuit household and inline agent | Vercel / Hobby | `apps/web` | `cd ../.. && npm run build:household` | managed; equivalent `npm run start --workspace=@recircuit/web` | `NODE_ENV=production`, `BROWSER_MODE=browserbase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `LLM_PROVIDER=gemini`, `LLM_API_KEY`, `LLM_FAST_MODEL=gemini-3.8-flash`, `LLM_STRONG_MODEL=gemini-3.8-flash`, `PORTAL_DECCAN_URL`, `PORTAL_PAPERPLUS_URL`, `PORTAL_QUICKSCRAP_URL` | `/api/health` |
| Existing | Household, portals, atomic nonce/action records, private evidence | Existing Supabase project / current free allocation | `supabase` (already applied) | none | managed | supplied privately to above services | household health checks records + private bucket |
| Existing | Remote Chromium | Existing Browserbase credits | no deployed repository service | none | sessions created by household | supplied privately to household only | blank create/disconnect/reconnect/release check passed; no portal navigation |

Do not set `RECIRCUIT_PERSISTENCE=local`, `RECIRCUIT_POLICY_MODE=fixture`, `NEXT_DIST_DIR`, or development storage directories in hosting. Never use a `NEXT_PUBLIC_` prefix for credentials. `PORT` is host-provided for standalone Next start; Vercel itself manages listeners. Portal build output no longer depends on the runtime port.

Deploy portals first, with production URLs reachable without Vercel deployment protection, so Browserbase can reach their HTML pages. Their health must return the intended recycler ID and `storage=supabase`. Configure the three resulting public HTTPS origins in the household project; localhost is rejected in production. Then deploy household and share only its production URL. Preview access protection must not obstruct the jury URL or the remote browser. No DNS change is required for the generated `vercel.app` URLs. Do not trigger bookings as a deployment health check.

Health validates configuration, Supabase reads and private bucket access; it does not prove continuing LLM/Browserbase quota availability. All credentials stay in server routes. Production household cookies are Secure, HttpOnly and SameSite=Strict. Evidence URLs require household ownership and expire after 60 seconds. No record/evidence migration is part of deployment.

## Why other free layouts were not selected

Render Free has 512 MB RAM per web service, sleeps after fifteen idle minutes and takes about a minute to wake. Its 750 monthly instance-hours are shared across a workspace. Four continuously active web services would exceed that allowance; free web service availability does not establish a free persistent worker. Combining four Next servers into one 512 MB process group was not validated and is not proposed. Vercel avoids an idle worker by splitting human waits across durable requests.

## Persistence boundaries

Essential active production records and evidence use Supabase. FileRepository, in-memory PGlite and local Chromium are rejected in production. Optional policy cache is process memory, with original source evidence and timestamps retained in persisted plans. Historical DEC files, screenshots and logs on the owner's laptop remain local archives; they were preserved and not imported. Browserbase sessions are temporary execution state, not durable evidence. Browserbase/LLM account quotas and free hosting eligibility must remain satisfied before deployment can be claimed ready.

Official limits checked on 23 October 2026: [Vercel functions](https://vercel.com/docs/functions/limitations), [Vercel Hobby terms](https://vercel.com/legal/terms), [Vercel free limits](https://vercel.com/docs/limits), [monorepo settings](https://vercel.com/docs/monorepos/monorepo-faq), [Fluid configuration](https://vercel.com/docs/project-configuration/vercel-json), [Render free limits](https://render.com/docs/free), [Render memory](https://render.com/pricing), [Browserbase session creation](https://docs.browserbase.com/reference/api/create-a-session), [Browserbase keep alive](https://docs.browserbase.com/platform/browser/long-sessions/overview).

Gemini compatibility sources: [Gemini 3.8 generateContent](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.8), [structured output validation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en), [Gemini 2.5 access restrictions](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash?authuser=3&hl=en).
