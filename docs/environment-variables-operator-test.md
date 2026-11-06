# Operator and test environment variables

These variables are intentionally excluded from `.env.example` because they are
only used by maintenance commands, CI, local diagnostics, or isolated database
tests. Do not keep write acknowledgements, restore targets, or provider API keys
in a long-lived production or staging runtime environment.

No value shown below is a real credential.

## Backup, restore, and seed

| Variable | Used by | Notes |
| --- | --- | --- |
| `BACKUP_DIR` | `npm run backup:database` | Optional output directory; defaults to `.backups`. |
| `BACKUP_FILE` | `npm run restore:database` | Required path for an explicit restore. |
| `RESTORE_DATABASE_URL` | Restore verification and execution | Must identify an isolated restore target. |
| `RESTORE_CONFIRM_DATABASE` | Restore execution | Must repeat the target database name. |
| `SEED_ADMIN_EMAIL` | Prisma seed | Optional initial administrator identity. |
| `SEED_ADMIN_PASSWORD` | Prisma seed | Required only when that seed path creates the administrator. |

## BrandLine and controlled GrinS operations

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEON_API_KEY` | `scripts/brand-lines-release.ts` | Supply only to the operator process that needs it. |
| `BRANDLINE_BOOTSTRAP_WRITE_ACK` | BrandLine bootstrap | Apply requires the exact acknowledgement `isolated-branch`. |
| `BRANDLINE_RELEASE_APPLY_ENDPOINT` | BrandLine release | Must repeat the endpoint verified by the release script. |
| `GRINS_OB2_LOCAL_WS` | Local OB2 verification | Exact local-only acknowledgement: `explicitly-approved-local-test`; never set in deployed environments. |
| `GRINS_STOCK_HOLD_WARNING_UNITS` | Stock hold report | Optional reporting threshold; default is `5`. |
| `EXPECTED_SYNC_RUNS` | ERP metadata audit | Optional expected-run count used by the audit. |

`GRINS_OPERATIONS_DIR` and `HAIRSHOP_CATALOG_SYNC_SECRET` are runtime variables
and therefore remain documented in `.env.example`.

## Legacy ERP and performance tools

| Variable | Purpose |
| --- | --- |
| `NOP_MSSQL_SERVER`, `NOP_MSSQL_DATABASE`, `NOP_SQLCMD` | Read-only legacy MSSQL audits. |
| `ERP_BENCH_ITERATIONS`, `ERP_PARSE_P95_BUDGET_MS` | ERP parser benchmark controls. |
| `LOAD_BASE_URL`, `LOAD_CONCURRENCY`, `LOAD_REQUESTS` | Load-smoke target and volume. |
| `LOAD_P95_BUDGET_MS`, `LOAD_MAX_ERROR_RATE` | Load-smoke pass/fail budgets. |
| `MAILPIT_API_URL` | Local/CI Mailpit verification endpoint. |
| `SHOT_BASE_URL`, `CHROME_PATH` | Screenshot and local browser tooling. |

## End-to-end and isolated database tests

| Variable | Purpose |
| --- | --- |
| `CI` | CI-provider marker consumed by Playwright. |
| `PLAYWRIGHT_BASE_URL` | Existing application URL for E2E tests. |
| `PLAYWRIGHT_WEB_SERVER_COMMAND` | Override for the Playwright-managed server. |
| `PLAYWRIGHT_SKIP_WEB_SERVER` | Exact value `1` skips the managed server. |
| `ALLOW_OUTBOX_DB_TESTS` | Exact value `isolated-neon-branch` gates outbox PostgreSQL integration tests. |
| `STOCK_TEST_DATABASE_URL` | Isolated stock-test database. |
| `STOCK_TEST_WRITE_ACK` | Exact isolated stock-test acknowledgement: `isolated-local`. |
| `STOCK_TEST_EVIDENCE_PATH` | Optional stock-test evidence output. |
| `TAXONOMY_TEST_DATABASE_URL` | Isolated taxonomy/BrandLine test database. |
| `TAXONOMY_TEST_WRITE_ACK` | Exact isolated taxonomy-test acknowledgement: `isolated-branch`. |

Standard operating-system variables such as `PATH`, `TEMP`, and `WINDIR`, plus
platform-provided `NODE_ENV`, `HOST`, `PORT`, `VERCEL_URL`, and `VERCEL_ENV`, are
not project secrets and are not duplicated in `.env.example`.
