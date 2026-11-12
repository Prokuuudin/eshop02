---
name: verify
description: How to build, run and drive eshop02 to verify changes end-to-end
---

# Verifying eshop02 changes

## Database first

`.env.local` points at the **production** database, and so does any dev server started from it
(usually `next dev` on **http://localhost:3000**). Treat :3000 as read-only: page views and GETs
only. Never place orders, log in, save forms or run write scripts against it.

Anything that writes runs against a disposable database:

- Local Docker Postgres: `docker run -d --rm --name <name> -e POSTGRES_PASSWORD=<pw> -e POSTGRES_DB=verify -p 127.0.0.1:55483:5432 postgres:17-alpine`,
  then `DATABASE_URL=<that url> npx prisma db push`.
- Start a separate server on it, in a worktree without `.env.local`:
  `DATABASE_URL=<that url> NEXT_PUBLIC_SITE_URL=http://localhost:3110 SMTP_HOST=smtp.invalid MFA_ENCRYPTION_KEY=<random 32 bytes base64> npx next dev --webpack -p 3110`.
- Admin pages: insert a platform admin with `mfaEnabled = true` and a `Session` row
  (`tokenHash = sha256(token)`, `mfaVerified = true`), send the token as cookie `eshop_session`,
  and set `eshop_current_user` in localStorage for the client gate.
- When done: stop the server (TaskStop leaves `start-server.js` listening; kill it by PID after
  checking its command line) and `docker stop` the database.

## Drive

- **API surfaces**: plain `curl` against the isolated server. Orders: `POST /api/orders` with `{ order: {...} }` — server generates the id, returns `{ success, orderId }`. Auth: `POST /api/auth/login` with `{ identifier: <card or staff email>, password }` (mirrors LoginForm).
- **UI surfaces**: Playwright script (not the test suite), `import { chromium } from '@playwright/test'`. Seed state via `page.addInitScript`: cart in localStorage key `cart-store` (`{ state: { items: [...] }, version: 0 }`, items need `lineKey`), user in `eshop_current_user`.
- Checkout gotchas: delivery radios are Radix (`label[for^="delivery-"]`, no `input[type=radio]`); phone field is `.phone-input input`; dismiss cookie banner («Принять все») before clicking submit; wait for `label[for^="delivery-"]` — `networkidle` fires before CSR hydration (page is a Suspense spinner first).
- E2E suite: `npm run test:e2e` only against a marked test database (`docs/e2e-database-isolation.md`).

## Inspect production (read-only)

- Prisma CLI needs TCP 5432 (blocked) — use a script with `Pool` from `@neondatabase/serverless` + `ws`
  outside the repository, inside `BEGIN TRANSACTION READ ONLY` (check `SHOW transaction_read_only`).
- Never delete rows from production by hand. Order ids are `max(id) + 1`, so deleting the newest
  orders hands their ids to the next real orders, and rows that only store an order id (bonus
  transactions, notes, status history) then point at someone else's order.
