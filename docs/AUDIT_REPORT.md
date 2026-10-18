# ReRoute — Stage 0–3 Adversarial Audit & Remediation Report

**Date:** October 18, 2026  
**Auditor:** Autonomous Pair Programmer (Agentic Audit Round)  
**Scope:** Stages 0, 1, 2, and 3 (Repo foundation, Domain Model & State Machine, Database Migrations, Mock Recycler Portals, User Intake & LLM Layer). Zero external API keys; 100% offline verifiable.

---

## 1. Executive Summary

A comprehensive adversarial audit was conducted across all Stage 0–3 deliverables to identify and remediate architectural defects, subtle state-machine flaws, cross-domain LLM hallucinations, database migration incompatibilities, security vulnerabilities, and accessibility gaps before proceeding to browser automation (Stage 4).

Every identified finding has been resolved in code and verified with comprehensive unit, integration, embedded PostgreSQL, and Playwright browser tests.

---

## 2. Test Suite Expansion (Before vs After)

| Test Suite / Area | Baseline Count (Commit `2cda113`) | Post-Audit Count | Delta | Status |
|---|---|---|---|---|
| `packages/core` — State Machine (`state-machine.test.ts`) | 42 | **85** | +43 | ✅ PASS |
| `packages/core` — User Intake (`intake.test.ts`) | 10 | **14** | +4 | ✅ PASS |
| `packages/llm` — Adapters & Structured Gen (`llm.test.ts`) | 4 | **6** | +2 | ✅ PASS |
| `apps/portals` — Portal Unit & Admin (`portal.test.ts`) | 30 | **35** | +5 | ✅ PASS |
| `packages/db` — Embedded PostgreSQL Migrations (`migrations.test.ts`) | 0 | **5** | +5 | ✅ PASS |
| **Total Vitest Tests** | **86** | **145** | **+59** | **✅ 100% PASS** |
| `tests/e2e` — Playwright Browser & Accessibility (`portals.spec.ts`) | 7 | **10** | +3 | **✅ 100% PASS** |
| `npm run lint` | 0 errors | **0 errors, 0 warnings** | Clean | ✅ PASS |
| `npm run typecheck` | 0 errors | **0 errors** | Clean | ✅ PASS |
| `npm run build` | dist/ build | **dist/ build clean** | Clean | ✅ PASS |

---

## 3. Comprehensive Findings & Fixes Log

| ID | Area | File:Line | Severity | Finding | Fix Applied | Verifying Test |
|---|---|---|---|---|---|---|
| **F-01** | State Machine | `packages/core/src/state-machine.ts:50` | **BLOCKER** | `hashPlan` omitted `slot`, item quantities, item weights, and fee/payout changes, allowing destination and scheduling tampering without invalidating approval. | Expanded `hashPlan` to deterministically serialize all 7 critical parameters: recycler ID, items array (ID, quantity, weight, description), fee, payout, slot. | `state-machine.test.ts` (7 distinct tests asserting hash changes for each field) |
| **F-02** | State Machine | `packages/core/src/state-machine.ts:430` | **HIGH** | `APPROVED` state exists on both Request and Leg. Transition checks did not prevent applying a Leg transition to a Request or vice versa. | Implemented separate `canTransitionRequest` and `canTransitionLeg` checks, and enforced strict entity type separation in `transitionState`. | `state-machine.test.ts` ("Strict Separation: Request vs Leg Transitions") |
| **F-03** | Database | `supabase/migrations/0001_init.sql:85` | **BLOCKER** | `status_events` table had `leg_id NOT NULL` and `leg_state` enum column, causing request pipeline transitions to fail database constraints. | Modified table to make `leg_id` nullable, added `request_id`, made state columns `TEXT` with a check constraint ensuring either `leg_id` or `request_id` is present. | `packages/db/src/migrations.test.ts` |
| **F-04** | Database | `supabase/migrations/0001_init.sql:1` | **HIGH** | Migration used `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` which fails in embedded environments like PGlite (WASM) and restricted Supabase roles. | Removed `pgcrypto` extension requirement; Postgres 13+ natively supports `gen_random_uuid()` in core. | `packages/db/src/migrations.test.ts` (tested offline with PGlite) |
| **F-05** | Database | `supabase/migrations/0001_init.sql:110` | **MEDIUM** | Partial unique index on `browser_actions(idempotency_key, action_type) WHERE result='success'` was defined in SQL but never verified by automated tests. | Created embedded PostgreSQL test suite verifying that multiple failures succeed while second success fails with unique constraint error. | `packages/db/src/migrations.test.ts` |
| **F-06** | Portals | `apps/portals/src/lib/config.ts:50` | **HIGH** | Recycler rates and acceptance lists were duplicated between `page.tsx` and `what-we-take/page.tsx`, creating drift risk. | Established `RECYCLER_CONFIGS` as single source of truth for rate cards, acceptance categories, and fee rules; pages render dynamically. | `apps/portals/src/test/portal.test.ts` |
| **F-07** | Portals | `apps/portals/src/lib/captcha.ts:1` | **HIGH** | CAPTCHA used stateful in-memory map which fails across serverless/multi-process deployments and was vulnerable to replay. | Refactored to stateless HMAC-signed encrypted tokens (`encCode:hash:expiry:nonce:sig`) with one-time nonce consumption stored in repository. | `portal.test.ts` & `portals.spec.ts` |
| **F-08** | Portals | `apps/portals/src/lib/repository/file-repository.ts:25` | **HIGH** | `FileRepository` lacked concurrency locking, risking write corruption under simultaneous booking requests. | Added mutex lock (`withLock`) and atomic writes (writing to temporary `.tmp` file followed by atomic rename). | `apps/portals/src/test/portal.test.ts` |
| **F-09** | Portals | `apps/portals/src/lib/config.ts:140` | **MEDIUM** | Pickup slot generation used local machine time without timezone qualification, causing UTC date mismatches. | Enforced `Asia/Kolkata` timezone in `Intl.DateTimeFormat` slot calculations. | `apps/portals/src/test/portal.test.ts` |
| **F-10** | Portals | `apps/portals/src/app/api/admin/route.ts:15` | **HIGH** | Admin token string comparison was vulnerable to timing attacks; query string token exposed in browser URL. | Replaced with `crypto.timingSafeEqual`, issued `HttpOnly` `admin_token` cookie, and stripped token from query string via `window.history.replaceState`. | `portal.test.ts` & `portals.spec.ts` |
| **F-11** | Portals | `apps/portals/src/components/BookingForm.tsx:110` | **MEDIUM** | Form fields lacked explicit `<label htmlFor="...">` and `<input id="...">` attributes, causing screen-reader inaccessibility. | Added explicit labels and matching IDs for all input elements across all 3 portals. | `tests/e2e/portals.spec.ts` (Automated Axe accessibility check) |
| **F-12** | Portals | `apps/portals/src/components/PaperPlusLayout.tsx:24` | **MEDIUM** | Top notice banners in PaperPlus and QuickScrap were placed outside `<header>`, violating WCAG landmark region rules. | Relocated notice banners inside `<header>` landmark. | `tests/e2e/portals.spec.ts` (Axe `region` rule verification) |
| **F-13** | Portals | `apps/portals/src/app/admin/page.tsx:28` | **HIGH** | Admin client page assumed unauthorized if query `?token=` was absent, failing to honor the valid `admin_token` cookie on page reload. | Updated `loadData` to probe `/api/admin` with session cookie if query token is absent. | `tests/e2e/portals.spec.ts` (admin reload verification) |
| **F-14** | Intake & LLM | `packages/core/src/intake/post-processor.ts:45` | **BLOCKER** | Naive `numberAppearsInText` allowed cross-domain hallucination (e.g. "8 kg newspaper and 150 cap" -> 8 extracted as fee cap, 150 as weight; pincode 500072 extracted as quantity). | Implemented unit-context checks: `feeAppearsInCurrencyContext`, `weightAppearsInWeightContext`, and `quantityAppearsInQuantityContext`. | `packages/core/src/intake/intake.test.ts` (tests 10 & 11) |
| **F-15** | Intake & LLM | `packages/core/src/intake/post-processor.ts:484` | **HIGH** | `createDomainRequestFromIntake` hardcoded item category `ELECTRONICS` and hazard `NON_HAZARDOUS` for every parsed item. | Mapped domain categories and hazards dynamically via `GROUP_TO_ITEM_CATEGORY` and canonical taxonomy entries. | `intake.test.ts` (official 3-item demo sentence test) |
| **F-16** | Intake & LLM | `packages/core/src/intake/taxonomy.ts:47` | **HIGH** | Taxonomy categories lacked 1-to-1 bijection with all 9 domain `ItemCategory` values (missing `textiles` and `hazardous`). | Added `textiles` and `hazardous` to canonical taxonomy and implemented verified bidirectional mappings (`ITEM_CATEGORY_TO_GROUP` and `GROUP_TO_ITEM_CATEGORY`). | `intake.test.ts` (test 13) |
| **F-17** | Intake & LLM | `packages/llm/src/adapters/anthropic.ts:8` | **HIGH** | Missing `LLM_API_KEY` threw generic Error, and missing provider key could theoretically fall back silently; no 429 rate limit backoff. | Throws typed `LlmConfigurationError` on missing API key; implemented 429 exponential backoff with full jitter in Anthropic and OpenAI adapters. | `packages/llm/src/test/llm.test.ts` |
| **F-18** | Repo Hygiene | `package.json:1` | **LOW** | Root package lacked `"type": "module"`, causing Vite CJS Node API deprecation warnings on every Vitest run. | Added `"type": "module"` to root `package.json` and converted `vitest.config.ts` to pure ESM with `fileURLToPath(import.meta.url)`. | `npx vitest run` (zero deprecation warnings) |
| **F-19** | Scripts | `scripts/start-portals.cjs:52` | **LOW** | Node deprecation warning DEP0190 triggered on Windows when passing args array with `shell: true`. | Formatted command line into a single string for `spawn` and added Windows TTY Ctrl+C listener. | `node scripts/start-portals.cjs` |

---

## 4. CLI User Intake Verification

The CLI intake parser (`scripts/intake-cli.mjs`) was tested against three real scenarios using offline fake LLM proposals:

### Run 1: Official Demo Sentence (3 Items, Fee Cap, Hyderabad Pincode)
**Input:**
```
node scripts/intake-cli.mjs "I have an old Dell laptop that doesn't turn on, plus about 8 kg of old newspapers and 3 dead AA batteries. My budget for pickup fees is ₹150 max. I'm in Kukatpally, Hyderabad 500072."
```
**Output:**
```
=== VALIDATED INTAKE RESULT ===
{
  "requestId": "ff884eb4-76c2-411c-b7db-eafb1928a1c8",
  "state": "ITEMS_PARSED",
  "location": {
    "rawText": "Kukatpally, Hyderabad 500072",
    "locality": "Kukatpally",
    "pincode": "500072",
    "city": "Hyderabad",
    "confidence": 0.98
  },
  "feeCapInr": 150,
  "items": [
    { "rawText": "old Dell laptop that doesn't turn on", "category": "laptop", "quantity": 1, "estimatedWeightKg": 2.2, "hazardClass": "battery_li_ion" },
    { "rawText": "8 kg of old newspapers", "category": "newspaper", "quantity": 1, "declaredWeightKg": 8, "estimatedWeightKg": 8, "hazardClass": "none" },
    { "rawText": "3 dead AA batteries", "category": "battery_household", "quantity": 3, "estimatedWeightKg": 0.09, "hazardClass": "battery_alkaline" }
  ],
  "clarifications": []
}
Resulting State: ITEMS_PARSED (Clean intake, feeCap: ₹150, items: 3).
```

### Run 2: Vague Item Description
**Input:**
```
node scripts/intake-cli.mjs "I have a mysterious metal box with wires and some things in Madhapur"
```
**Output:**
```
Resulting State: NEEDS_CLARIFICATION
Clarification: [CLARIFY_ITEM_VAGUE] Could you specify what kind of item "mysterious metal box with wires" is?
```

### Run 3: Location Outside Hyderabad Service Area
**Input:**
```
node scripts/intake-cli.mjs "one laptop, Bengaluru"
```
**Output:**
```
Resulting State: NEEDS_CLARIFICATION
Clarification: [LOCATION_OUTSIDE_SERVICE_AREA] ReRoute currently only operates within Hyderabad (Telangana). We noticed "Bengaluru". Is there a Hyderabad address for pickup?
```

---

## 5. Security and Environment Verification

1. **No Secret Leakage:** Root `.env.example` documents all required keys (`BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_FAST_MODEL`, `LLM_STRONG_MODEL`, `ADMIN_TOKEN`, `CAPTCHA_SECRET`, `BROWSER_MODE`, `RECYCLER_ID`, `PORTALS_DATA_DIR`) without default secret values.
2. **Git Hygiene:** Neither `.env` nor `.env.local` is tracked or committed.
3. **Stateless CAPTCHA:** Signed with `CAPTCHA_SECRET` using HMAC-SHA256 and symmetric encryption; nonces tracked to prevent replay attacks.
4. **XSS Protection:** Verified by Playwright test `Malicious script tags in customer name or address are safely rendered and not executed`.

---

## 6. Audit Conclusion

All Stage 0–3 modules are verified, completely offline functional, robustly tested, and strictly compliant with the deterministic safety rules of ReRoute.

**Stage 4 (Browser Automation & Policy Reader) may now begin.**
