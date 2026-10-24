# Release-blocker execution evidence

E = `C:\Users\Manish\Downloads\ReCircuit-Local\.data\release-blockers-20261024\evidence`. Append-only raw ledger: E/execution.jsonl. Startup/server lifetimes are not solver latency. No credential values were command arguments.

| Check | Started UTC | Finished UTC | Wall ms | Exit | Exact argv | Raw output |
|---|---|---|---:|---:|---|---|
| final-full-audit | 2026-10-24T05:31:15.301Z | 2026-10-24T05:31:27.950Z | 12649 | 0 | `cmd.exe /d /c npm.cmd audit --json` | E/final-full-audit-1792819875301.log |
| final-production-audit | 2026-10-24T05:31:28.005Z | 2026-10-24T05:31:29.248Z | 1243 | 0 | `cmd.exe /d /c npm.cmd audit --omit=dev --json` | E/final-production-audit-1792819888005.log |
| final-clean-ci | 2026-10-24T03:26:11.265Z | 2026-10-24T03:36:08.045Z | 596780 | 0 | `cmd.exe /d /c npm.cmd ci --ignore-scripts --no-fund --audit=false` | E/final-clean-ci-1792812371265.log |
| final-production-only-ci | 2026-10-24T03:26:10.919Z | 2026-10-24T03:35:55.580Z | 584661 | 0 | `cmd.exe /d /c npm.cmd ci --omit=dev --ignore-scripts --no-fund --audit=false` | E/final-production-only-ci-1792812370919.log |
| production-runtime-dependency-check | 2026-10-24T03:45:18.615Z | 2026-10-24T03:45:25.019Z | 6404 | 0 | `node ../production-runtime-check.mjs` | E/production-runtime-dependency-check-1792813518615.log |
| final-native-complete | 2026-10-24T04:08:52.491Z | 2026-10-24T04:11:31.720Z | 159229 | 0 | `node ../final-cross-system.mjs` | E/final-native-complete-1792814932491.log |
| release-final-full-tests | 2026-10-24T05:02:11.487Z | 2026-10-24T05:05:33.335Z | 201848 | 0 | `node node_modules/vitest/vitest.mjs run` | E/release-final-full-tests-1792818131487.log |
| release-final-typecheck | 2026-10-24T05:05:33.517Z | 2026-10-24T05:06:38.779Z | 65262 | 0 | `cmd.exe /d /c npm.cmd run typecheck` | E/release-final-typecheck-1792818333517.log |
| release-final-lint | 2026-10-24T05:06:38.958Z | 2026-10-24T05:08:13.389Z | 94431 | 0 | `node node_modules/eslint/bin/eslint.js . --ext .ts,.tsx --max-warnings 0` | E/release-final-lint-1792818398958.log |
| final-existing-browser | 2026-10-24T05:08:13.617Z | 2026-10-24T05:13:39.373Z | 325756 | 0 | `node ../browser.mjs` | E/final-existing-browser-1792818493617.log |
| final-household-build | 2026-10-24T05:29:00.841Z | 2026-10-24T05:29:47.930Z | 47089 | 0 | `cmd.exe /d /c npm.cmd run build:household` | E/final-household-build-1792819740841.log |
| final-portals-build | 2026-10-24T05:29:48.028Z | 2026-10-24T05:30:44.429Z | 56401 | 0 | `cmd.exe /d /c npm.cmd run build:portals` | E/final-portals-build-1792819788028.log |
| final-production-copy | 2026-10-24T05:30:44.513Z | 2026-10-24T05:30:54.948Z | 10435 | 0 | `node ../copy-production-builds.mjs` | E/final-production-copy-1792819844513.log |
| final-production-only-browser | 2026-10-24T05:30:59.179Z | 2026-10-24T05:31:15.242Z | 16063 | 0 | `node scripts/audit-release-production.mjs` | E/final-production-only-browser-1792819859179.log |
| final-config-normalization | 2026-10-24T05:31:29.301Z | 2026-10-24T05:31:29.482Z | 181 | 0 | `node ../configuration.mjs` | E/final-config-normalization-1792819889301.log |
| final-preservation | 2026-10-24T05:31:29.646Z | 2026-10-24T05:31:35.254Z | 5608 | 0 | `node ../preservation.mjs` | E/final-preservation-1792819889646.log |
| final-diff-check | 2026-10-24T05:31:35.310Z | 2026-10-24T05:31:35.390Z | 80 | 0 | `git diff --check` | E/final-diff-check-1792819895310.log |
| owned-native-shutdown | 2026-10-24T04:15:55.209Z | 2026-10-24T04:15:56.203Z | 995 | 0 | `node ../shutdown.mjs` | E/owned-native-shutdown-1792815355209.log |
| final-owned-ports | 2026-10-24T05:31:29.536Z | 2026-10-24T05:31:29.595Z | 60 | 0 | `node ../ports-final.mjs` | E/final-owned-ports-1792819889536.log |
| browser-query-trace-diagnosis | 2026-10-24T04:40:29.907Z | 2026-10-24T04:40:30.038Z | 131 | 0 | `python ../trace-summary.py` | E/browser-query-trace-diagnosis-1792816829907.log |
| final-production-origin-checks | 2026-10-24T05:30:55.041Z | 2026-10-24T05:30:59.126Z | 4085 | 0 | `node ../production-probe.mjs` | E/final-production-origin-checks-1792819855041.log |
| loopback-origin-regressions-final | 2026-10-24T05:01:57.711Z | 2026-10-24T05:02:10.969Z | 13258 | 0 | `node node_modules/vitest/vitest.mjs run apps/web/src/lib/request-origin.test.ts` | E/loopback-origin-regressions-final-1792818117711.log |
| final-household-journey | 2026-10-24T05:19:26.936Z | 2026-10-24T05:23:31.780Z | 244844 | 0 | `node ../household-journey.mjs` | E/final-household-journey-1792819166936.log |
| final-decline-ui-evidence | 2026-10-24T05:26:38.104Z | 2026-10-24T05:28:12.810Z | 94706 | 0 | `node ../decline-evidence.mjs` | E/final-decline-ui-evidence-1792819598104.log |
| timeout-trace-integrity-baseline | 2026-10-24T05:13:07.303Z | 2026-10-24T05:13:07.439Z | 136 | 0 | `node ../trace-integrity.mjs` | E/timeout-trace-integrity-baseline-1792818787303.log |

## Preserved unsuccessful executions

| Check | Exit | Wall ms | Raw output |
|---|---:|---:|---|
| audit-before | 1 | 53596 | E/audit-before-1792807021958.log |
| audit-production-before | 1 | 67169 | E/audit-production-before-1792807027977.log |
| migration-typecheck | 2 | 12020 | E/migration-typecheck-1792807295061.log |
| migration-unit | 1 | 25518 | E/migration-unit-1792807358065.log |
| migration-unit-process | 1 | 29309 | E/migration-unit-process-1792807402211.log |
| migration-typecheck-2 | 2 | 74561 | E/migration-typecheck-2-1792807358049.log |
| migrated-browser | 1 | 370057 | E/migrated-browser-1792807664548.log |
| production-startup-browser | 1 | 6354 | E/production-startup-browser-1792808450726.log |
| native-init | 1 | 73454 | E/native-init-1792809110815.log |
| native-rollback-backup-restart | 1 | 2013 | E/native-rollback-backup-restart-1792809629650.log |
| native-stage-typecheck | 2 | 23443 | E/native-stage-typecheck-1792809782104.log |
| provider-stage-lint | 1 | 26549 | E/provider-stage-lint-1792810574198.log |
| final-native-routing-browser | 1 | 27354 | E/final-native-routing-browser-1792810855395.log |
| final-native-cross-system | 1 | 20092 | E/final-native-cross-system-1792811360655.log |
| final-native-cross-system-corrected | 1 | 29654 | E/final-native-cross-system-corrected-1792811521855.log |
| final-full-tests | 1 | 102099 | E/final-full-tests-1792813253329.log |
| final-full-tests-bounded | 1 | 114740 | E/final-full-tests-bounded-1792813459708.log |
| final-cross-system-history-verified | 1 | 33121 | E/final-cross-system-history-verified-1792814168576.log |
| final-cross-system-history-ready | 1 | 45038 | E/final-cross-system-history-ready-1792814406153.log |
| final-cross-system-warm | 1 | 75301 | E/final-cross-system-warm-1792814530053.log |
| final-native-cross-system | 1 | 55796 | E/final-native-cross-system-1792814703548.log |
| final-native-hydrated-cross-system | 1 | 43115 | E/final-native-hydrated-cross-system-1792814853831.log |
| release-final-full-tests | 1 | 172541 | E/release-final-full-tests-1792815110472.log |
| real-postgrest-server | 1 | 6100034 | E/real-postgrest-server-1792809255987.log |
| release-final-full-tests | 1 | 125033 | E/release-final-full-tests-1792815323542.log |
| final-existing-browser | 1 | 612471 | E/final-existing-browser-1792815728718.log |
| final-existing-browser | 1 | 239740 | E/final-existing-browser-1792816402247.log |
| final-production-only-browser | 1 | 31632 | E/final-production-only-browser-1792817699211.log |
| final-production-origin-checks | 1 | 22631 | E/final-production-origin-checks-1792818936272.log |

Server wrappers stopped intentionally may exit nonzero; these are not successful test checks. Every failed test/harness execution remains raw evidence. Causes and corrections are recorded in STATUS.md and NATIVE_DATABASE.md.

## Final document and archived-bundle preservation

| Check | Started UTC | Finished UTC | Wall ms | Exit | Evidence |
|---|---|---|---:|---:|---|
| final-report-assembly | 2026-10-24T05:32:01.427Z | 2026-10-24T05:32:01.491Z | 64 | 0 | E/final-report-assembly-1792819921427.log |
| final-document-preservation | 2026-10-24T05:33:16.581Z | 2026-10-24T05:33:27.454Z | 10873 | 0 | E/final-document-preservation-1792819996581.log |
| final-document-diff-check | 2026-10-24T05:33:17.362Z | 2026-10-24T05:33:17.462Z | 100 | 0 | E/final-document-diff-check-1792819997362.log |

Final scan: 407 source files, 348 browser assets (including current production-only and preserved previous production bundles), 1790 evidence files; zero matches for actual provider/synthetic-native credential bytes. Env ignored/untracked; three timeout trace hashes, both original video hashes and the main report hash preserved. Native and browser audit ports were closed. These are measured scan counts at this checkpoint, not a scan of arbitrary unrelated files or a general security certification.
