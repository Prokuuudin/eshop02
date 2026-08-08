# Architecture

## Runtime map

- `app/[lang]`: localized storefront and admin UI. Components are server-side by default; interactive leaves opt into `use client`.
- `app/api`: HTTP boundary. Routes authenticate first, validate untrusted input, call `lib` services, and return stable error codes.
- `lib/*-server-*`, `lib/server-*`: server-only persistence, authentication and pricing. These modules must never be reachable from a client component.
- `lib/client-*`, hooks and Zustand stores: browser adapters and ephemeral UI state. Cart, preferences and the explicit demo session may use localStorage; identity, prices, permissions and orders remain server-authoritative.
- `prisma`: schema and forward-only migrations. Search and restore checks live in `scripts`.
- `proxy.ts`: language canonicalization, correlation IDs and mutation origin checks at the request boundary.
- `lib/observability.ts`: structured operational events. Raw request bodies, email addresses, tokens and rendered email HTML must not be logged.

## Enforced boundaries

`npm run audit:architecture` runs locally and in CI. It rejects dependency cycles, client-to-server-only dependency paths, secret-like `NEXT_PUBLIC_*` names, and new production modules over 800 lines.

The oversized-module baseline is empty. Brand legal fields, invitation models, product form context and order edit calculations live in dedicated modules. Checkout and admin orders use page hooks and section components.

## Refactoring backlog

1. Gradually move remaining route-local request shapes into `lib/api-schemas.ts` when an endpoint is changed. Do not perform a flag-day response-format migration across 132 routes.
2. Keep API logs structured through `logOperationalEvent`/`logApiError`; ESLint rejects raw `console.*` in route handlers.
3. Continue shrinking complex modules toward 500 lines when their behavior is next changed; CI rejects files above 800 lines.

## Local quality gate

Run `npm run lint`, `npm run typecheck`, `npm run audit:security`, `npm run audit:architecture`, `npm test`, then `npm run build`. Browser and production-dependent checks are documented in `docs/deployment-checklist.md` and `docs/production-runbooks.md`.
