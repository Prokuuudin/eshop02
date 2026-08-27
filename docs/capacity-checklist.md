# Capacity checklist

- [ ] Run load tests against an isolated staging database, never production or a shared mutable fixture database.
- [ ] Record p50/p95/p99, throughput, HTTP errors, DB connections, CPU and memory for every release candidate.
- [ ] Keep catalog, search, checkout-page and health p95 below the configured budget with zero unexpected 4xx/5xx responses.
- [ ] Apply the search GiST migration and confirm the search plan uses `Product_search_trgm_gist_idx`.
- [ ] Repeat the HTTP run for at least 30 minutes before concluding memory is stable.
- [ ] Test checkout mutations with dedicated stock, promo and bonus fixtures that can be discarded afterward.
- [ ] Ensure only one winner for the last stock unit, last promo use and final available bonus balance.
- [ ] Record the same manual payment concurrently and confirm one state transition.
- [ ] Start two ERP jobs and confirm one receives the lock; confirm a failed run never deactivates products.
- [ ] Confirm all large list endpoints enforce non-negative `skip` and bounded positive `take`.
- [ ] Verify DB outage produces health 503, SMTP failure alerts, and ERP failure preserves existing catalog data.
- [ ] Revisit budgets after collecting staging/production telemetry; local laptop numbers are a regression baseline, not production capacity.
