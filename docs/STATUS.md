# ReRoute — Build Status

## Stage 1 — Data Model + State Machine (Completed)

| Area | Status |
|---|---|
| Monorepo scaffold (npm workspaces) | ✅ Done |
| Root tsconfig, ESLint, Vitest | ✅ Done |
| `npm run build` (tsc emitting to dist/) | ✅ Done |
| `.gitignore`, `.env.example` | ✅ Done |
| `packages/core` — domain types (`feeCapInr`, RequestState, LegState) | ✅ Done |
| `packages/core` — Zod evidence schemas | ✅ Done |
| `packages/core` — state machine (Request pipeline + Leg lifecycle) | ✅ Done |
| `packages/core` — stale approval enforcement in `transitionState` | ✅ Done |
| `packages/core` — terminal states refusal (no exits) | ✅ Done |
| `packages/db` — placeholder | ✅ Done |
| `supabase/migrations/0001_init.sql` | ✅ Done |
| `supabase/seed.sql` (3 recyclers) | ✅ Done |
| `docs/STATE_MACHINE.md` | ✅ Done |
| Vitest tests — state machine (42 tests) | ✅ Done |

## Stage 2 — Mock Recycler Portals (Fixes Completed)

| Component / Requirement | Status |
|---|---|
| 3 distinct recycler sites (`deccan`, `paperplus`, `quickscrap`) | ✅ Done |
| Cross-platform launcher script `npm run portals:dev` | ✅ Done |
| `BookingRepository` — `FileRepository` | ✅ Verified in tests |
| `BookingRepository` — `SupabaseRepository` (`0002_portal.sql`) | 🟡 UNTESTED until Supabase is configured |
| Public tracking endpoint `GET /api/bookings?ref=<ref>` | ✅ Done |
| ADMIN_TOKEN security: 503 "Admin disabled" when unset on `/admin`, `/api/admin`, `/api/reset` | ✅ Done |
| Site selection: production requires `RECYCLER_ID`; cross-recycler 404s enforced | ✅ Done |
| QuickScrap notice "Registration: application in process" + accordions | ✅ Done |
| Playwright E2E browser suite (`tests/e2e/portals.spec.ts`) | ✅ Done |
| Vitest unit suite (`apps/portals/src/test/portal.test.ts` - 30 tests) | ✅ Done |
| Idempotency protection (P0-16) | 🟡 PARTIAL (portal dedupe only; agent-side idempotency is Stage 7) |

## Stage 3 — User Intake + Item Classification (Completed)

| Component / Requirement | Status |
|---|---|
| `packages/llm` — provider-agnostic `generateStructured` | ✅ Done (Anthropic, OpenAI, Fake adapters) |
| `packages/llm` — auto-retry on malformed JSON or schema error; typed `LlmOutputError` | ✅ Done |
| `packages/core/src/intake/taxonomy.ts` — 14 canonical categories, groups, hazard classes, per-unit weights | ✅ Done |
| `packages/core/src/intake/localities.ts` — Hyderabad demo locality + pincode mapping | ✅ Done |
| `packages/core/src/intake/schema.ts` — Zod schemas for proposal and validated result | ✅ Done |
| `packages/core/src/intake/post-processor.ts` — anti-hallucination check for `feeCapInr` and weight | ✅ Done |
| `packages/core/src/intake/post-processor.ts` — out-of-city rejection, missing paper weight check, vague item fallback | ✅ Done |
| `packages/core/src/intake/post-processor.ts` — `applyClarification` resolution and state transition | ✅ Done |
| TypeScript RFC4122 v4 UUID assignment (never LLM) | ✅ Done |
| CLI `npm run intake -- "<text>"` | ✅ Done |
| Vitest tests — intake & classification (10 tests in core + 4 tests in llm) | ✅ Done |
| Total Vitest unit tests: 118 passing across all packages | ✅ Done |

## Known Issues

- `FileRepository` writes to local filesystem and does not persist on Vercel serverless; production deployment needs Supabase.
- Live LLM smoke requires external API keys (`LLM_API_KEY`); fake provider used for deterministic CI/CD testing.

## Hackathon Test Cases

| TC | Description | Status |
|---|---|---|
| TC1 | Laptop accepted → pickup draft created | 🟡 IN PROGRESS (building blocks only) |
| TC2 | Centre takes paper but not batteries → batteries rejected | 🟡 IN PROGRESS (building blocks only) |
| TC3 | Fee above user's limit → approval asked | 🟡 IN PROGRESS (building blocks only) |
| TC4 | Pickup requested → not reported as collected | 🟡 IN PROGRESS (building blocks only) |
