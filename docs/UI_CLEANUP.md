# UI consistency and cleanup

The household application and the three recycler portals use the forest-green routing visual system, shared tokens and local system sans-serif typography. Recycler navigation, service information, page widths and footers now use one layout with tenant-specific routes and restrictions.

Tracking uses a labelled compact form with an explicit primary button. Saved results show status, requested versus assigned windows, fee details and collection history. Operator sign-in uses a centred 440px card, SVG lock icon, password field and labelled action. Authentication and credential storage behavior are unchanged.

The shared recycling SVG loader provides a contextual status message, `aria-busy`, smooth rotation and a stationary reduced-motion variant. It replaces the previous household progress panel and portal/routing loading messages. Tracking, operator and proposal refreshes retain saved content while requests are pending. Errors stop loading and remain visible.

Normal pages no longer expose the workspace explanation, demo/reset controls, failure switches or their containers. The former explanation routes return 404. Internal provenance, simulated-event labels, test APIs, registration caveats, fee calculation, verification requirements and routing safeguards remain available. No records or recordings were reset or replaced.

## Route inventory

| Application | Reachable page types |
| --- | --- |
| Household | `/`, `/arrange` (including edit), `/test-cases`, `/r/[requestId]` (review, rejected and booked states) |
| Deccan | `/`, `/accepted-items`, `/pickup-charges`, `/book-pickup`, `/book-pickup/confirmation`, `/track`, `/admin` |
| PaperPlus | `/`, `/what-we-take` (including rates anchor), `/schedule`, `/schedule/done`, `/status`, `/admin` |
| QuickScrap | `/`, `/rates`, `/pickup`, `/pickup/thanks`, `/track-order`, `/admin` |
| All recyclers | `/admin/routing`, `/admin/routing/preparation`, `/admin/routing/fleet`, `/admin/routing/proposals`, `/admin/routing/proposals/[id]` |
| Retired | `/about-workspace` in both applications; no remaining navigation entry |

## Verification and evidence

The audit utilities are `scripts/audit-ui-cleanup.mjs` and `scripts/audit-ui-cleanup-states.mjs`. Evidence is written into unique directories under `.data/ui-cleanup-20261024/`; earlier failures are preserved. The route audit checks 1366×768, 1440×900, 390px mobile, 768px tablet, actual Chrome 200% zoom via `chrome.tabs.setZoom/getZoom`, keyboard focus, visible button labels, overflow and WCAG A/AA axe findings. The state audit intercepts browser reads to inspect pending, reduced-motion, invalid-reference, empty and service-error states without modifying saved records.

Final verification passed: both application builds, lint, typecheck and 86 affected tests across nine files. The consolidated browser evidence covers 50 page/state URLs and 250 settled captures with no remaining overflow, blank-button, keyboard-focus or axe findings. All three tenants passed keyboard tracking submission, required/invalid reference handling, background-result retention, reduced-motion and service-error checks. Simulated weighed records retain their event labels and display “Weight recorded”; a stored lifecycle state is not presented as independently proven collection.

See `.data/ui-cleanup-20261024/browser-summary.json`, `checks-release.json` and `final-state.json` for detailed results and exact commit/status information. Earlier memory failures, development-server startup/navigation failures, contrast findings and failed test assertions remain in their original evidence directories. Corrections were recaptured rather than overwriting failed captures.

The browser uses the existing local sample dataset with external providers disabled. Interactive live basemap success and live provider operations are outside this styling verification; the ordered stop list, saved route diagram and disabled-provider fallback remain available. The data is still sample data, and saved simulated history is not independent evidence of real collection or certification.

Review URLs for this task use ports 3460 (Deccan), 3461 (PaperPlus), 3462 (QuickScrap) and 3463 (household). The existing sample session entry is `http://127.0.0.1:3463/api/demo-session`. Routing starts at `/admin/routing?date=2026-10-24`. Use the locally configured operator token to access authenticated pages.

All four pre-existing generated `next-env.d.ts` and `tsconfig.json` edits are excluded from the UI commit. Build and development tooling can regenerate their references and include paths. The original root worktree's unrelated submission-document edit is outside this presentation worktree and remains untouched.
