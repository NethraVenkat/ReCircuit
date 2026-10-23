# ReCircuit — Autonomous Reverse-Logistics Agent

ReCircuit is the reverse-logistics agent that gets your e-waste to the right recycler, books the pickups after approval, and proves every status it reports.

## Monorepo Layout

```
apps/
  web/        Next.js frontend (placeholder)
  portals/    Recycler portal (placeholder)
  worker/     Background job runner (placeholder)
packages/
  core/       Domain types, state machine, pure functions (zero network I/O)
  db/         Supabase client + typed query helpers
supabase/
  migrations/ SQL DDL
  seed.sql    Demo recyclers
docs/         Architecture docs
```

## Quick Start

```bash
cp .env.example .env
npm install
npm run typecheck
npm test
```

## Portals (Stage 2 — Mock Recycler Websites)

`apps/portals` hosts three realistic mock recycler websites that the autonomous agent operates through browser automation:

1. **Deccan E-Cycle** (`http://localhost:3101`): Certified e-waste recycler (green corporate layout, left sidebar, CPCB badge, data-wipe ack).
2. **PaperPlus Kabadi** (`http://localhost:3102`): Paper scrap buyer (yellow/amber informal layout, top tab bar, 5 kg minimum, server-distorted SVG human verification).
3. **QuickScrap Hyd** (`http://localhost:3103`): Unregistered scrap aggregator (dark dense monospace layout, ₹199 flat fee, application in-process notice).

### Starting All 3 Portals Concurrently

```bash
npm run portals:dev
```

This starts all three portal instances locally on ports 3101, 3102, and 3103.

### Admin Console & Simulated Downstream Events

Each portal provides an admin interface at `/admin?token=ADMIN_TOKEN` (requires setting `ADMIN_TOKEN` in the environment; no default) to:
- Confirm bookings (`RECEIVED` → `CONFIRMED`)
- Assign pickup slots (`CONFIRMED` → `SCHEDULED`)
- Simulate physical pickup with 6-digit OTP generation (`SCHEDULED` → `PICKED_UP`)
- Record depot weighbridge tickets (`PICKED_UP` → `WEIGHED`)
- Toggle agent failure switches (HTTP 500, omitted reference, changed policy layout)
- Reset demo state via `POST /api/reset`

### Running Portal Tests

```bash
# Vitest unit & integration tests
npm run test:portals

# Playwright E2E browser tests (starts portals automatically)
npm run test:e2e
```

## Env Vars
See `.env.example`.


## Server-side LLM configuration

Groq is the primary provider when `GROQ_API_KEY` is present and `LLM_PROVIDER` is unset.
Set `LLM_PROVIDER=groq` explicitly in production, with private `GROQ_API_KEY` and
`GROQ_MODEL=openai/gpt-oss-20b` (the default). No key belongs in `NEXT_PUBLIC_*` variables.
Groq uses its Chat Completions API with JSON Schema best-effort mode, preserving optional
fields in existing contracts; local Zod validation and policy source-quote checks remain mandatory.
See https://console.groq.com/docs/structured-outputs for current model support.

For explicit Gemini rollback, set `LLM_PROVIDER=gemini`, `LLM_API_KEY`,
`LLM_FAST_MODEL` and `LLM_STRONG_MODEL` to Gemini configuration. Explicit selection wins;
provider failures never trigger cross-provider fallback. Known portal DOM fallback remains
labelled `dom-fallback`, never successful AI extraction. Policy evidence records attempted
LLM provider/model separately from extraction method. Retries share a deadline and honor
Retry-After; permanent authentication/model/schema configuration errors stop retries.
Local tests may explicitly select `LLM_PROVIDER=fake`; production rejects fake.
