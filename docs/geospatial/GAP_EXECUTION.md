# Actual routing gap-closure execution ledger

E = `C:\Users\Manish\Downloads\ReCircuit-Local\.data\routing-gap-20261024\evidence`. Commands ran in the isolated routing worktree unless a helper explicitly launched another isolated process. Wrapper wall time includes startup; server uptime is not solver latency. UTC timestamps correspond to 24 October IST. The full append-only ledger also retains intermediate runs. No credential values were command arguments.

| Check | Started UTC | Finished UTC | Wall ms | Exit | Exact argv | Raw output |
|---|---|---|---:|---:|---|---|
| baseline | 2026-10-23T22:05:33.342Z | 2026-10-23T22:05:43.022Z | 9680 | 0 | `node node_modules/vitest/vitest.mjs run` | E/baseline.log |
| geocoding | 2026-10-23T22:12:41.223Z | 2026-10-23T22:12:42.474Z | 1251 | 0 | `node node_modules/vitest/vitest.mjs run apps/portals/src/lib/geospatial/geocoding.test.ts` | E/geocoding.log |
| shared-sql | 2026-10-23T22:11:35.674Z | 2026-10-23T22:11:39.321Z | 3647 | 0 | `node node_modules/vitest/vitest.mjs run apps/portals/src/lib/geospatial/shared-store.test.ts` | E/shared-sql.log |
| shared-process | 2026-10-23T22:19:40.850Z | 2026-10-23T22:19:47.607Z | 6757 | 0 | `node node_modules/vitest/vitest.mjs run apps/portals/src/lib/geospatial/shared-process.test.ts` | E/shared-process.log |
| http-negative | 2026-10-23T22:26:58.081Z | 2026-10-23T22:26:59.775Z | 1694 | 0 | `node node_modules/vitest/vitest.mjs run apps/portals/src/lib/geospatial/api-negative.test.ts apps/portals/src/lib/geospatial/gap-regressions.test.ts` | E/http-negative.log |
| release-shared-browser | 2026-10-23T22:36:35.157Z | 2026-10-23T22:36:56.241Z | 21084 | 0 | `node scripts/audit-routing-gaps.mjs` | E/release-shared-browser.log |
| final-actual-api | 2026-10-23T22:48:54.405Z | 2026-10-23T22:48:55.097Z | 692 | 0 | `node scripts/audit-routing-api.mjs` | E/final-actual-api.log |
| native-zoom | 2026-10-23T22:46:54.433Z | 2026-10-23T22:47:02.311Z | 7878 | 0 | `node scripts/audit-routing-native-zoom.mjs` | E/native-zoom.log |
| verified-existing-browser | 2026-10-23T22:49:21.137Z | 2026-10-23T22:50:18.195Z | 57058 | 0 | `node node_modules/@playwright/test/cli.js test tests/e2e/test-cases-dashboard.spec.ts tests/e2e/test-cases-hydration.spec.ts tests/e2e/item-fidelity-browser.spec.ts tests/e2e/security-deep.spec.ts --trace=retain-on-failure --output=C:\Users\Manish\Downloads\ReCircuit-Local\.data\routing-gap-20261024\evidence\playwright-verified-results` | E/verified-existing-browser.log |
| security-update-regressions | 2026-10-23T22:38:50.443Z | 2026-10-23T22:39:08.494Z | 18052 | 0 | `node node_modules/vitest/vitest.mjs run` | E/security-update-regressions.log |
| final-lint-clean | 2026-10-23T22:51:16.549Z | 2026-10-23T22:51:35.122Z | 18573 | 0 | `node node_modules/eslint/bin/eslint.js . --ext .ts,.tsx --max-warnings 0` | E/final-lint-clean.log |
| final-typecheck-clean | 2026-10-23T22:51:15.724Z | 2026-10-23T22:51:29.496Z | 13772 | 0 | `cmd.exe /d /c npm.cmd run typecheck` | E/final-typecheck-clean.log |
| portal-build | 2026-10-23T22:39:53.688Z | 2026-10-23T22:40:19.938Z | 26250 | 0 | `node node_modules/next/dist/bin/next build apps/portals` | E/portal-build.log |
| household-build-final | 2026-10-23T22:51:15.527Z | 2026-10-23T22:51:34.466Z | 18939 | 0 | `cmd.exe /d /c npm.cmd run build:household` | E/household-build-final.log |
| preservation | 2026-10-23T22:52:19.958Z | 2026-10-23T22:52:20.939Z | 981 | 0 | `node ..\..\routing-gap-20261024\preservation.mjs` | E/preservation.log |
| dependency-audit-after | 2026-10-23T22:37:58.839Z | 2026-10-23T22:38:01.606Z | 2767 | 1 | `cmd.exe /d /c npm.cmd audit --json` | E/dependency-audit-after.log |

Dependency audit exit 1 denotes unresolved actual advisories, not a passing security gate. Live smoke stayed unexecuted; its opt-in skip is not a LIVE VERIFIED result.

## Preserved failed executions

| Label | Exit | Wall ms | Evidence |
|---|---:|---:|---|
| dependency-audit | 1 | 3760 | E/dependency-audit.log |
| integrated-typecheck | 2 | 6315 | E/integrated-typecheck.log |
| lint | 1 | 15165 | E/lint.log |
| gap-browser | 1 | 24951 | E/gap-browser.log |
| gap-browser-corrected | 1 | 5103 | E/gap-browser-corrected.log |
| final-lint | 1 | 16236 | E/final-lint.log |
| final-typecheck | 2 | 6958 | E/final-typecheck.log |
| baseline-scope-reproduction | 1 | 1588 | E/baseline-scope-reproduction.log |
| dependency-audit-after | 1 | 2767 | E/dependency-audit-after.log |
| release-existing-browser | 1 | 99739 | E/release-existing-browser.log |
| hydration-reproduction | 1 | 16479 | E/hydration-reproduction.log |
| final-existing-browser | 1 | 85935 | E/final-existing-browser.log |
| dashboard-diagnostics | 1 | 46266 | E/dashboard-diagnostics.log |

Failures include expected defect reproductions, new implementation lint/type errors, the actual map accessibility finding, an invalid reused-fixture assumption, cold browser-readiness failures and dependency advisories. Their causes/corrections/limits are described in GAP_CLOSURE.md. Assertions were retained.

## Fresh offline performance sample

Raw file: `E/audit-performance-1792795133073.json`, observed at 2026-10-23T22:38:53.073Z. No external provider traffic occurred. Synthetic matrix elements here are already in memory. These are samples under the audit machine workload, not percentile or production latency claims.

| Stops | Vehicles | Conversion ms | Optimize ms | Replay ms | Served | Unassigned | Planned m | Evaluations | Guarantee | HTTP | Requested elements |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 0 | 1 | 0.002 | 0.527 | 0.464 | 0 | 0 | 0 | 1 | proven-optimum | 0 | 0 |
| 1 | 1 | 5.453 | 0.941 | 0.281 | 1 | 0 | 300 | 5 | proven-optimum | 0 | 0 |
| 4 | 1 | 1.234 | 1.303 | 0.523 | 4 | 0 | 990 | 58 | proven-optimum | 0 | 0 |
| 7 | 1 | 4.767 | 39.728 | 0.851 | 7 | 0 | 1680 | 5131 | proven-optimum | 0 | 0 |
| 20 | 4 | 5.736 | 20.999 | 5.757 | 20 | 0 | 4670 | 830 | heuristic-feasible | 0 | 0 |
| 50 | 4 | 24.423 | 135.535 | 53.294 | 50 | 0 | 19710 | 4365 | heuristic-feasible | 0 | 0 |

Stopping condition: exhaustive enumeration for ≤7 pickups / one vehicle when all are served, otherwise bounded deterministic heuristic search; global 20000 evaluation ceiling. Single kg load dimension. No local search is implemented. Heap observations in separate benchmark files are affected by garbage collection and are not memory guarantees.
