# Performance baseline — 2026-08-08

Environment: local `next start` production build on port 3010, Neon test database, 20 measured requests per HTTP scenario, concurrency 5, one warm-up request excluded. HTTP budget: p95 <= 2000 ms and error rate 0.

| Scenario | p50 | p95 | p99 | Requests/s | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Catalog page API | 284 ms | 871 ms | 880 ms | 11.26 | 0% |
| Search API | 645 ms | 682 ms | 683 ms | 7.78 | 0% |
| Checkout page | 20 ms | 35 ms | 36 ms | 194.35 | 0% |
| Health/DB probe | 135 ms | 149 ms | 150 ms | 34.45 | 0% |

The isolated Next production process grew from about 148 MB working set to 190 MB after the run. This single sample is not evidence of a leak; repeated soak measurements are required for a leak conclusion.

ERP parser benchmark (`export_sample.xml`, 15,425 bytes, 23 products, 100 iterations): p50 1.70 ms, p95 4.36 ms, p99 5.12 ms, final process heap 8.87 MB. CI budget: parser p95 <= 100 ms.

## SQL plan

`EXPLAIN (ANALYZE, BUFFERS)` for search completed in 81.121 ms on the current test database and used `Product_isDeleted_isActive_idx`, followed by heap filtering and sorting. It did not use `Product_search_trgm_gist_idx` because migration `20260808130000_add_product_search_gist` is not applied yet. Re-run `npm run test:search-plan` after deployment migration and require the trigram index before accepting the production baseline.

## Concurrency and degradation

- The last stock unit is claimed by only one of two concurrent checkout attempts.
- Promo usage and bonus debit use conditional atomic updates; losing races roll back the order.
- Concurrent duplicate Stripe events are serialized and applied once.
- Only one concurrent ERP run acquires the sync lock.
- DB health failure returns 503 without leaking the DB error.
- Missing Stripe configuration fails closed before order/session work.
- Permanent SMTP failure emits an alert and surfaces the error without pointless retries.
- ERP fetch/upsert failure prevents deactivation and emits alert events.

## Reproduction

1. Build with `npx next build --webpack`.
2. Start an isolated production server, for example `npm start -- -p 3010`.
3. Set `LOAD_BASE_URL=http://localhost:3010` and run `npm run test:load:smoke`.
4. Run `npm run test:erp:performance`.
5. Run `npm run test:search-plan` against the intended non-production database.
