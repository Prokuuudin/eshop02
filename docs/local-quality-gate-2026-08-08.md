# Local quality gate — 2026-08-08

- ESLint: pass, 0 warnings.
- TypeScript: pass.
- Unit: 832/832 pass, including observability, health, pagination, restore-safety, IDOR, invoice-payment, Stripe-webhook, telemetry-redaction, SMTP degradation and ERP locking assertions.
- Integration: 7/7 pass, including the concurrent last-stock checkout.
- Next production build: pass, 585 static pages generated. Build was run directly with `npx next build --webpack`, without `prisma migrate deploy`.
- Axe/keyboard accessibility: 3/3 Chromium checks pass.
- Android checkout: bank and card flows pass independently.
- E2E root cause: stale localStorage-only authentication and obsolete navigation expectations hid behind a 120-second RBAC timeout. Tests now use real server sessions; the unsupported global `b2b` role was removed from the UI; demo B2B no longer destroys its in-memory invoices with a reload; and smoke has independent critical/admin/account scripts. The combined gate deliberately uses one worker because the fixtures and test database are shared.
- E2E results: admin flows 4/4, RBAC 5/5, critical flows 8/8 plus corrected category flows 4/4, account flows 2/2, accessibility 3/3, and Android checkout bank/card flows pass.
- Combined Chromium smoke: 23/23 pass in 1.8 minutes with one worker on the final build.
- Performance smoke: catalog/search/checkout/health budgets pass; see `performance-baseline-2026-08-08.md`.
- Local security scan: pass, tracked and untracked non-ignored project files checked.

The build reports two non-blocking maintenance warnings: migrate deprecated `middleware.ts` to `proxy.ts`, and refresh the Browserslist database.
