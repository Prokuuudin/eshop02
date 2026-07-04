---
name: verify
description: How to build, run and drive eshop02 to verify changes end-to-end
---

# Verifying eshop02 changes

## Handle

- Dev server usually already running: `next dev --webpack` on **http://localhost:3000** (check `netstat -ano | findstr :3000`). HMR picks up source edits — no rebuild needed.
- If not running: `npm run dev` (needs `.env` + `.env.local`; DB is Neon over WebSocket 443, VPN blocks TCP 5432).

## Drive

- **API surfaces**: plain `curl` against `localhost:3000/api/...`. Orders: `POST /api/orders` with `{ order: {...} }` — server generates the id, returns `{ success, orderId }`. Auth: `POST /api/auth/sync` with `{ id, email, password }` (mirrors LoginForm).
- **UI surfaces**: Playwright script (not the test suite) run from repo root, `import { chromium } from '@playwright/test'`. Seed state via `page.addInitScript`: cart in localStorage key `cart-store` (`{ state: { items: [...] }, version: 0 }`, items need `lineKey`), user in `eshop_current_user`.
- Checkout gotchas: delivery radios are Radix (`label[for^="delivery-"]`, no `input[type=radio]`); phone field is `.phone-input input`; dismiss cookie banner («Принять все») before clicking submit; wait for `label[for^="delivery-"]` — `networkidle` fires before CSR hydration (page is a Suspense spinner first).

## Inspect / clean DB

- Prisma CLI needs TCP 5432 (blocked) — use a `scripts/_tmp_*.ts` with `Pool` from `@neondatabase/serverless` + `ws`, run via `npx tsx --env-file=.env --env-file=.env.local scripts/_tmp_x.ts`.
- Neon is a shared test copy of the live shop DB: delete any orders/users you created (match on your obvious fake names), delete the `_tmp_` script after.
