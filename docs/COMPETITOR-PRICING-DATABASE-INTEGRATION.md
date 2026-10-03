# Competitor Pricing: isolated database integration

Status: Stage 9A preparation only. No database command has been run, the pending migration has not been moved or
applied, and no Prisma repository exists yet.

## Safety boundary

Competitor Pricing integration uses only `COMPETITOR_PRICING_TEST_DATABASE_URL`. It never falls back to
`DATABASE_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, or `POSTGRES_URL_NON_POOLING`. Those existing variables are
read only as an immutable production denylist. If none is available, any is malformed, or the test target cannot be
distinguished from every available production identity, the guard fails closed.

The target must be an identifiable Neon PostgreSQL endpoint on port 5432 with username, password, and database
metadata. Pooled and direct forms of one Neon endpoint are normalized to the same identity. Query parameters and
credentials are excluded from the SHA-256 fingerprint and from all output. An operator-supplied branch label is
required and production-like labels are rejected, but the label is only an additional check: endpoint/database
identity comparison remains mandatory.

The guard also rejects a test database on the same normalized Neon endpoint as production even when the database
name differs. A distinct Neon endpoint is therefore mandatory, not merely a different label or schema name.

Set these values in the shell or an ignored `.env.local`; never commit the URL or credentials:

```dotenv
COMPETITOR_PRICING_TEST_DATABASE_URL=postgresql://<test-only-neon-credentials>@<test-endpoint>/<test-database>?sslmode=require
COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT=sha256:<64 lowercase hex characters>
COMPETITOR_PRICING_TEST_DATABASE_BRANCH=competitor-pricing-stage9
COMPETITOR_PRICING_INTEGRATION_MODE=isolated-test
COMPETITOR_PRICING_DB_WRITE_ENABLED=false
```

`DATABASE_URL` (or another existing production URL variable) must remain available to the process for denylist
comparison. Do not replace it with the test URL. The guard additionally refuses `NODE_ENV=production`.

All current helper commands are offline: they parse environment metadata and do not open a socket.

1. Set only the dedicated test URL and branch label.
2. Run `npm run pricing:db:describe-target`. Verify the redacted hostname, database, Neon endpoint and branch in the
   Neon console, then copy the printed fingerprint into `COMPETITOR_PRICING_TEST_DATABASE_FINGERPRINT`.
3. Set `COMPETITOR_PRICING_INTEGRATION_MODE=isolated-test` and run `npm run pricing:db:preflight`.
4. Only immediately before approved write-capable work, set `COMPETITOR_PRICING_DB_WRITE_ENABLED=true` and run
   `npm run pricing:db:preflight:write`. Unset it again after the session.

Neither preflight applies migrations nor connects to PostgreSQL.

## Dedicated integration suite

Future PostgreSQL tests belong under `tests/competitor-pricing-integration/` and use
`vitest.competitor-pricing.integration.config.ts`. Its setup requires the write guard before test modules load and
runs one worker with no file parallelism. Do not put real Competitor Pricing DB tests under the repository's existing
`tests/integration/`: that suite currently contains mocked transaction tests and has no database safety boundary.

The future client factory must receive `requireCompetitorPricingIntegrationTarget().connectionString()` explicitly
and construct a dedicated, disposable Prisma client. It must never import the global `lib/prisma` singleton, mutate
`DATABASE_URL`, or infer a target from the normal application environment. Repository adapters receive that client
through dependency injection and disconnect it in teardown. This is required because the global singleton eagerly
selects the normal application URL (including production fallbacks) and caches the resulting client process-wide.

## Stage 9B migration plan (not executed)

The pending migration remains in
`prisma/pending-migrations/20261003120000_competitor_pricing/`. Static review confirms that its forward SQL creates
only six pricing tables, their indexes, foreign keys and checks; it does not alter `Product` or another existing
table. `rollback.sql` drops exactly those six tables in dependency-safe order and contains no `Product` operation.

Stage 9B must be a separately approved session:

1. Confirm the Neon branch in the provider console and run the write preflight above.
2. Create a separate Prisma CLI config that receives the already guarded test connection string explicitly. Do not
   use the current `prisma.config.ts`, because it loads `.env.local`, and do not run `npm run build`, because build
   starts with `prisma migrate deploy`.
3. Apply the pending SQL only to the guarded target, inspect all six tables/checks/FKs, and exercise rollback on a
   disposable reset of that same branch.
4. Re-apply and verify schema drift. Only then decide how to register/move the migration into `prisma/migrations/`;
   never move it before the non-production proof is complete.
5. Stop on any target mismatch, unavailable metadata, drift, partial application, or rollback touching an object
   outside the six-table allowlist.

No executable migration wrapper is provided in Stage 9A: exposing a write command before the dedicated Prisma
config and non-production confirmation would recreate the `.env.local` production risk this stage is removing.

## Stage 9B synthetic test-data plan

Use a random run namespace such as `cp-it-<timestamp>-<random>` in every created ID/name/URL. Create only synthetic
Competitor, CompetitorProduct and Product rows needed by the test; never query a production-cloned Product and then
modify it. Cleanup must delete only rows carrying the current namespace, assert the expected delete counts, and fail
instead of broadening its predicate. A disposable Neon branch reset is the final containment layer, not a substitute
for scoped cleanup.

PostgreSQL tests must cover:

- atomic observation append/touch plus operational-state update;
- append sequence A→B→A produces three historical states rather than touching the first A;
- replay and stale-event no-op semantics;
- two concurrent writes for one competitor product (one append/touch result, no duplicate latest state);
- transaction rollback after an injected failure;
- conditional latest-observation update conflicts;
- recommendation `openKey` uniqueness and stale input/revision rejection;
- trusted mapping `exclusiveKey` uniqueness under concurrent decisions;
- `Product` cascade behavior and `Competitor` delete restriction;
- every price/currency/count/confidence CHECK constraint in the pending SQL;
- cleanup isolation between two simultaneous namespaces.

Repository implementation, application read paths, scheduler, real competitor access and price mutations remain out
of scope until those database properties are proven on the isolated branch.
