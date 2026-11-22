# Deployment checklist

## Before deployment

- [ ] `npm ci` completes with the committed lockfile.
- [ ] `npm run audit:security` passes.
- [ ] `npm run lint` passes without warnings.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:integration` passes.
- [ ] `npx next build --webpack` passes.
- [ ] `npm run test:e2e:smoke` passes with one worker.
- [ ] `npm run test:erp:performance` and the staging `npm run test:load:smoke` budgets pass.
- [ ] Accessibility Chromium checks pass; WebKit checkout job is green.
- [ ] Production environment has `DATABASE_URL`, SMTP, Turnstile, MFA and unsubscribe secrets; no private value uses a `NEXT_PUBLIC_` name.

## Production accounts and initial administration

- [ ] Remove the runtime demo-account seeding from the shared application providers (`SeedAccounts` / `seedTestAccounts`). Test fixtures inside `*.test.ts` may remain.
- [ ] Confirm that no known demo credentials such as `admin@test.com` / `admin123` or `user@test.com` / `user123` can authenticate against the production API.
- [ ] Audit the production `User` table and delete or disable test/demo users before accepting real traffic. Preserve records that are legally or operationally required by related test orders instead of deleting them blindly.
- [ ] Configure a strong, unique `ADMIN_SETUP_TOKEN` as a server-only production secret. Never expose it through a `NEXT_PUBLIC_` variable, repository file, screenshot or client log.
- [ ] Open `/auth/admin-setup` on the production domain and create the first real administrator with an individual company email and a unique password stored in the approved password manager.
- [ ] Verify that the administrator receives a secure server session, can open `/admin`, and that a second call to `/api/auth/admin-setup` is rejected with `admin_already_exists`.
- [ ] Enable and verify MFA for the real administrator, save recovery codes securely, and create a separately named emergency administrator if the access policy requires one.
- [ ] Remove or rotate `ADMIN_SETUP_TOKEN` after bootstrap. All later administrator access must be granted through the normal authenticated access-management flow.
- [ ] In a clean browser profile, confirm that local storage contains no pre-seeded admin/customer and that ordinary registration cannot grant the `admin` role.

## Database and recovery

- [ ] Take or confirm a recent backup before migrations.
- [ ] Enable Neon PITR for the production project.
- [ ] Apply `20260808130000_add_product_search_gist` during deployment.
- [ ] Run the search-plan check after the migration.
- [ ] Restore the backup into an isolated database and run `npm run test:restore` with `RESTORE_DATABASE_URL`.
- [ ] Record restore duration and evidence; never point the restore check at production.

## Payments and integrations

- [ ] Confirm checkout exposes only the approved manual payment methods.
- [ ] Confirm bank-transfer, invoice and office-payment orders remain unpaid until a manager records payment.
- [ ] Confirm ERP sync completes and its failure alert reaches the on-call channel.
- [ ] Send one test transactional email and verify delivery plus SMTP failure alerting.

## Observability

- [ ] Connect the production log drain/monitoring provider.
- [ ] Configure alerts for payment failures/mismatches, ERP sync failures, SMTP failures, health DB failures and elevated API 5xx rates.
- [ ] Verify correlation IDs appear in request and operational logs.
- [ ] Confirm telemetry redacts emails, credentials and sensitive query parameters.

## Release and rollback

- [ ] Deploy to preview/staging and complete Safari/WebKit plus Android checkout checks.
- [ ] Smoke-test catalog, search, checkout, account, admin and ERP sync in staging.
- [ ] Record the previous deployment identifier and database migration state.
- [ ] Deploy production, check `/api/health`, payment flow and error-rate dashboards.
- [ ] Roll back the application if health/payment/API thresholds regress; use the documented database recovery procedure rather than an ad-hoc destructive rollback.
