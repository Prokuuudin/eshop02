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
- [ ] Production environment has `DATABASE_URL`, Stripe, SMTP, Turnstile, MFA and unsubscribe secrets; no private value uses a `NEXT_PUBLIC_` name.

## Database and recovery

- [ ] Take or confirm a recent backup before migrations.
- [ ] Enable Neon PITR for the production project.
- [ ] Apply `20260808130000_add_product_search_gist` during deployment.
- [ ] Run the search-plan check after the migration.
- [ ] Restore the backup into an isolated database and run `npm run test:restore` with `RESTORE_DATABASE_URL`.
- [ ] Record restore duration and evidence; never point the restore check at production.

## Payments and integrations

- [ ] Stripe webhook endpoint uses the production signing secret.
- [ ] Deliver a signed Stripe test event and confirm the event is processed once.
- [ ] Confirm an unpaid `checkout.session.completed` event does not mark an order paid.
- [ ] Confirm ERP sync completes and its failure alert reaches the on-call channel.
- [ ] Send one test transactional email and verify delivery plus SMTP failure alerting.

## Observability

- [ ] Connect the production log drain/monitoring provider.
- [ ] Configure alerts for payment failures/mismatches, ERP sync failures, SMTP failures, health DB failures and elevated API 5xx rates.
- [ ] Verify correlation IDs appear in request and operational logs.
- [ ] Confirm telemetry redacts emails, Stripe secrets and sensitive query parameters.

## Release and rollback

- [ ] Deploy to preview/staging and complete Safari/WebKit plus Android checkout checks.
- [ ] Smoke-test catalog, search, checkout, account, admin and ERP sync in staging.
- [ ] Record the previous deployment identifier and database migration state.
- [ ] Deploy production, check `/api/health`, payment flow and error-rate dashboards.
- [ ] Roll back the application if health/payment/API thresholds regress; use the documented database recovery procedure rather than an ad-hoc destructive rollback.
