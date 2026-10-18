# ReRoute — Deployment Guide & Status

This document describes the deployment architecture for ReRoute, the mock recycler portals, and deployment status.

---

## 1. Portal Architecture & Deployment Strategy

ReRoute interacts with three distinct mock recycler portals representing different Hyderabad e-waste and scrap vendors:
1. **Deccan E-Cycle Solutions** (`deccan`): Formal e-waste recycler, requires data wipe acknowledgement, free pickup for >= 5 kg, flat ₹180 fee below 5 kg.
2. **PaperPlus Kabadi** (`paperplus`): Specialized dry scrap aggregator, minimum 5 kg weight required, rejects electronics, requires human verification CAPTCHA.
3. **QuickScrap Hyderabad** (`quickscrap`): Unregistered doorstep scrap aggregator, flat ₹50 convenience fee, rate card per item.

All three portals are implemented in a single Next.js codebase (`apps/portals`). The active site behavior and branding are governed strictly by the `RECYCLER_ID` environment variable:
- `RECYCLER_ID=deccan`
- `RECYCLER_ID=paperplus`
- `RECYCLER_ID=quickscrap`

In development, port routing automatically maps `3101` to Deccan, `3102` to PaperPlus, and `3103` to QuickScrap. In production, `RECYCLER_ID` is strictly required; missing it causes a configuration 500 error, and accessing cross-recycler routes returns HTTP 404.

---

## 2. Deployment Status (Pre-Flight & Stage 4)

| Service | Environment / Provider | Status | Notes |
|---|---|---|---|
| **Deccan Portal** | Vercel (`apps/portals`) | Local Mode (`http://localhost:3101`) | Vercel CLI unauthenticated |
| **PaperPlus Portal** | Vercel (`apps/portals`) | Local Mode (`http://localhost:3102`) | Vercel CLI unauthenticated |
| **QuickScrap Portal** | Vercel (`apps/portals`) | Local Mode (`http://localhost:3103`) | Vercel CLI unauthenticated |
| **Supabase** | Cloud Postgres & Storage | **NOT CONFIGURED** | Local file repository fallback active |
| **Browser Runner** | Browserbase / Playwright | **Local Playwright** | Offline local browser runner active |

---

## 3. Production Deployment Instructions

### Prerequisites
1. **Vercel CLI Login**:
   Run the following interactive command in your terminal:
   ```bash
   npx vercel login
   ```
2. **Supabase Setup**:
   Create a Supabase project and provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Run migrations:
   ```bash
   npx vitest run packages/db/src/migrations.test.ts
   ```

### Deploying the Three Portals to Vercel
Deploy `apps/portals` three times with distinct project names and environment variables:

1. **Deploy Deccan**:
   ```bash
   cd apps/portals
   npx vercel --prod --yes --env RECYCLER_ID=deccan --env ADMIN_TOKEN="<ADMIN_TOKEN>"
   ```
2. **Deploy PaperPlus**:
   ```bash
   cd apps/portals
   npx vercel --prod --yes --env RECYCLER_ID=paperplus --env ADMIN_TOKEN="<ADMIN_TOKEN>"
   ```
3. **Deploy QuickScrap**:
   ```bash
   cd apps/portals
   npx vercel --prod --yes --env RECYCLER_ID=quickscrap --env ADMIN_TOKEN="<ADMIN_TOKEN>"
   ```

Set the resulting public URLs in `.env.local` or worker environment:
```env
PORTAL_DECCAN_URL=https://deccan-reroute.vercel.app
PORTAL_PAPERPLUS_URL=https://paperplus-reroute.vercel.app
PORTAL_QUICKSCRAP_URL=https://quickscrap-reroute.vercel.app
```

