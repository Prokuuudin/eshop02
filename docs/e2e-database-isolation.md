# E2E database isolation

E2E fixtures include a platform admin whose password and TOTP secret are committed, and the
app under test writes orders, accounts and settings. E2E therefore never runs against the
application database. `scripts/e2e-database-guard.ts` enforces this fail-closed.

## What is checked, and when

| Check | Where | Connects? |
|---|---|---|
| `PLAYWRIGHT_BASE_URL` is not the production site | `playwright.config.ts` | no |
| `E2E_DATABASE_URL` is set and `E2E_DATABASE_ISOLATED_ACK=isolated-test-db` | config, global setup, specs | no |
| URL is not the production Neon endpoint (pooled or direct host) | same | no |
| URL is not any database named in `.env.local` (read with `dotenv.parse`, never loaded) | same | no |
| Host is loopback or exactly `E2E_DATABASE_ALLOWED_HOST` | same | no |
| The database itself carries the comment `eshop02-e2e-disposable:<E2E_DATABASE_MARKER>` | config (before the web server starts), global setup and every direct spec connection | read-only |

Hostnames are not identity: Neon branches share one password with production, and a branch
copied from production looks like any other host. The marker lives inside the database, so
production and any fresh copy of it are refused until someone deliberately marks that copy.

The web server receives `DATABASE_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL` and
`POSTGRES_URL_NON_POOLING` pinned to the E2E URL, so nothing falls back to `.env.local`.

## Setting up a test database

1. Create a disposable database: a local Docker Postgres, or a Neon branch that is **not** the
   production branch.
2. Create `.env.e2e` (git-ignored):

   ```
   E2E_DATABASE_URL=postgresql://postgres:<pw>@127.0.0.1:55432/hairshop_e2e
   E2E_DATABASE_ISOLATED_ACK=isolated-test-db
   E2E_DATABASE_MARKER=<16+ random characters of [A-Za-z0-9_-], unique to this database>
   # E2E_DATABASE_ALLOWED_HOST=<exact host>   only for a non-loopback database
   MFA_ENCRYPTION_KEY=<32 random bytes, base64; test-only>
   ```

3. Create the schema (`DATABASE_URL=<that url> npx prisma db push`).
4. Mark it: `npm run e2e:mark-db -- --confirm-disposable`. The same static checks run first;
   only the database comment is written, and a non-E2E comment is never replaced.
5. Check: `npm run e2e:verify-db`, then `npm run test:e2e`.

CI: the E2E jobs read `E2E_DATABASE_URL`, `E2E_DATABASE_ALLOWED_HOST` and `E2E_DATABASE_MARKER`
from repository secrets; the CI database must be marked once with the same marker.

## Other database test suites

Integration suites use in-process PGlite. Opt-in suites that take a URL from the environment
(`ALLOW_OUTBOX_DB_TESTS`, `TAXONOMY_TEST_*`, `STOCK_TEST_*`) refuse the production endpoint.
