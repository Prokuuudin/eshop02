# Money Float→Decimal Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the app's real money fields as Postgres `numeric(12,2)` (Prisma `Decimal`) instead of `double precision` (Prisma `Float`), while every existing consumer keeps working with plain JS `number` exactly as today.

**Architecture:** Schema change (16 fields, 6 models) + a Prisma Client Extension that converts `Decimal → number` on every query result at the client boundary, so business logic (`lib/server-pricing.ts`, `lib/tax.ts`, etc.) needs zero changes. A handful of existing per-model mapper functions (`mapDbToServerOrder`, `mapDbToInvoice`, `mapCompany`, `mapDbToProduct`, `getCatalogPrices`) get an explicit `.toNumber()`-style wrap where TypeScript's static types (not runtime values) will otherwise flag a mismatch. Migration applied to the live Neon DB manually (this repo's `prisma migrate dev` is broken — see Global Constraints), with a before/after reconciliation script.

**Tech Stack:** Prisma 7.8.0 (Prisma Client Extensions, `Decimal`/decimal.js), PostgreSQL (Neon), Vitest.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-20-money-decimal-storage-design.md` — read it before starting, every task below implements a piece of it.
- Scope is exactly these 16 fields, no others: `Order.{subtotal,tax,delivery,discount,total}`, `Invoice.{subtotal,taxAmount,total,paidAmount,remainingAmount}`, `Company.{creditLimit,usedCredit}`, `Product.{price,oldPrice}`, `ProductSubscription.pricePerUnit`, `ReturnRequest.refundAmount`. Do not touch `Invoice.taxRate`, `PromoCode.discount`/`minOrder`, `ProductSubscription.discountPercent`, `Order.bonusSpent`/`bonusEarned`, `Product.bonusRate`/`rating` — different kind of value, out of scope.
- `npx prisma migrate dev` does not work in this repo (broken shadow-DB replay from a past rollback). Use the manual workflow documented in memory `project-migration-workflow-broken`: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → hand-write `migration.sql` → `prisma db execute --file` → `prisma migrate resolve --applied` → `prisma generate`. `npm run build` runs `prisma migrate deploy` automatically, so any migration folder left in `prisma/migrations/` auto-applies on the next Vercel deploy — keep that in mind for sequencing (Task 8/9 below apply the migration manually before the code deploy, same order every other migration this project has used).
- Schema, extension code, and the migration must land together — see Task 8 for why (a `Decimal`-typed schema pointed at a still-`double precision` column, or vice versa, breaks at the Postgres wire protocol, not just types).
- Every task that touches code ends with `npm run typecheck` and the relevant test command passing before moving on.

---

### Task 1: `toNum`/`toNumOrNull` conversion helper

**Files:**
- Create: `lib/decimal.ts`
- Test: `lib/decimal.test.ts`

**Interfaces:**
- Produces: `toNum(value: Prisma.Decimal | number): number`, `toNumOrNull(value: Prisma.Decimal | number | null): number | null` — used by every later task that reads a money field.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/decimal.test.ts
import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { toNum, toNumOrNull } from './decimal'

describe('toNum', () => {
  it('converts a Prisma.Decimal to a number', () => {
    expect(toNum(new Prisma.Decimal('19.99'))).toBe(19.99)
  })

  it('passes a plain number through unchanged', () => {
    expect(toNum(42)).toBe(42)
  })
})

describe('toNumOrNull', () => {
  it('returns null for null input', () => {
    expect(toNumOrNull(null)).toBeNull()
  })

  it('converts a Decimal', () => {
    expect(toNumOrNull(new Prisma.Decimal('5.50'))).toBe(5.5)
  })

  it('passes a plain number through', () => {
    expect(toNumOrNull(7)).toBe(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts lib/decimal.test.ts`
Expected: FAIL — `Cannot find module './decimal'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/decimal.ts
import { Prisma } from '@/generated/prisma/client'

/**
 * Prisma returns Decimal-typed DB columns as a Prisma.Decimal (decimal.js) instance.
 * The app has always worked with these fields as plain `number` — this converts back
 * to that shape at the boundary. Defensive pass-through for plain numbers too (safe to
 * call whether or not the underlying column has been migrated yet — see
 * docs/superpowers/specs/2026-07-20-money-decimal-storage-design.md).
 */
export function toNum(value: Prisma.Decimal | number): number {
  return value instanceof Prisma.Decimal ? value.toNumber() : value
}

export function toNumOrNull(value: Prisma.Decimal | number | null): number | null {
  return value === null ? null : toNum(value)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts lib/decimal.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/decimal.ts lib/decimal.test.ts
git commit -m "feat: add Decimal<->number conversion helper for money fields"
```

---

### Task 2: Prisma Client Extension — convert money fields on every query result

**Files:**
- Create: `lib/prisma-money-extension.ts`
- Test: `lib/prisma-money-extension.test.ts`
- Modify: `lib/prisma.ts` (wire the extension into the exported client)

**Interfaces:**
- Consumes: `toNum` from `lib/decimal.ts` (Task 1).
- Produces: `moneyFieldsExtension` (a `Prisma.defineExtension` result) and `convertMoneyFields(model, value)` (exported separately so it's unit-testable without a real DB connection). `lib/prisma.ts` continues to export `prisma` with the exact same call surface (`prisma.order.findMany(...)` etc.) as today.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/prisma-money-extension.test.ts
import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { convertMoneyFields } from './prisma-money-extension'

describe('convertMoneyFields', () => {
  it('converts known money fields from Decimal to number', () => {
    const row = { id: '1', total: new Prisma.Decimal('99.90'), email: 'a@b.c' }
    const result = convertMoneyFields('Order', row) as typeof row
    expect(result.total).toBe(99.9)
    expect(typeof result.total).toBe('number')
  })

  it('leaves non-money fields untouched', () => {
    const row = { id: '1', total: new Prisma.Decimal('10'), email: 'a@b.c' }
    const result = convertMoneyFields('Order', row) as { email: string }
    expect(result.email).toBe('a@b.c')
  })

  it('passes through models with no configured money fields unchanged', () => {
    const row = { id: '1', foo: 'bar' }
    expect(convertMoneyFields('SomeUnknownModel', row)).toBe(row)
  })

  it('handles arrays of rows (findMany results)', () => {
    const rows = [
      { id: '1', price: new Prisma.Decimal('5') },
      { id: '2', price: new Prisma.Decimal('7.25') },
    ]
    const result = convertMoneyFields('Product', rows) as Array<{ price: number }>
    expect(result.map((r) => r.price)).toEqual([5, 7.25])
  })

  it('passes through null and primitive results unchanged (count, aggregate, etc.)', () => {
    expect(convertMoneyFields('Order', null)).toBeNull()
    expect(convertMoneyFields('Order', 5)).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts lib/prisma-money-extension.test.ts`
Expected: FAIL — `Cannot find module './prisma-money-extension'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/prisma-money-extension.ts
import { Prisma } from '@/generated/prisma/client'
import { toNum } from './decimal'

/**
 * Money fields stored as Postgres `numeric` (Prisma `Decimal`) — every consumer in this
 * app has always worked with these as plain `number`. This extension converts them back
 * at the query boundary so nothing else has to change. Scope must match
 * docs/superpowers/specs/2026-07-20-money-decimal-storage-design.md exactly.
 */
export const MONEY_FIELDS_BY_MODEL: Record<string, string[]> = {
  Order: ['subtotal', 'tax', 'delivery', 'discount', 'total'],
  Invoice: ['subtotal', 'taxAmount', 'total', 'paidAmount', 'remainingAmount'],
  Company: ['creditLimit', 'usedCredit'],
  Product: ['price', 'oldPrice'],
  ProductSubscription: ['pricePerUnit'],
  ReturnRequest: ['refundAmount'],
}

export function convertMoneyFields(model: string, value: unknown): unknown {
  const fields = MONEY_FIELDS_BY_MODEL[model]
  if (!fields || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => convertMoneyFields(model, item))

  const row = value as Record<string, unknown>
  for (const field of fields) {
    if (row[field] instanceof Prisma.Decimal) {
      row[field] = toNum(row[field] as Prisma.Decimal)
    }
  }
  return row
}

export const moneyFieldsExtension = Prisma.defineExtension({
  name: 'moneyFieldsToNumber',
  query: {
    $allModels: {
      async $allOperations({ model, args, query }) {
        const result = await query(args)
        return model ? convertMoneyFields(model, result) : result
      },
    },
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts lib/prisma-money-extension.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire the extension into the real client**

Modify `lib/prisma.ts` — current content is:

```typescript
import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'
import { PrismaClient } from '../generated/prisma/client'

neonConfig.webSocketConstructor = ws

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function getDbUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  if (!url) throw new Error('No DATABASE_URL set')
  return url
}

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: getDbUrl() })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

Replace it with:

```typescript
import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'
import { PrismaClient } from '../generated/prisma/client'
import { moneyFieldsExtension } from './prisma-money-extension'

neonConfig.webSocketConstructor = ws

function getDbUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  if (!url) throw new Error('No DATABASE_URL set')
  return url
}

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: getDbUrl() })
  return new PrismaClient({ adapter }).$extends(moneyFieldsExtension)
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>
const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 6: Typecheck and run the full unit suite (nothing should change yet — schema is still `Float`)**

Run: `npm run typecheck && npm run test:unit`
Expected: both pass exactly as before this task (the extension is a no-op until fields are actually `Decimal` — no `Prisma.Decimal` values exist yet in any query result, so `convertMoneyFields` never matches anything).

- [ ] **Step 7: Commit**

```bash
git add lib/prisma-money-extension.ts lib/prisma-money-extension.test.ts lib/prisma.ts
git commit -m "feat: add Prisma extension converting money Decimal fields to number"
```

---

### Task 3: Schema change — 16 fields to `Decimal @db.Decimal(12,2)`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing new.
- Produces: regenerated Prisma Client types where these 16 fields are `Prisma.Decimal` instead of `number` — this is what makes Task 4/5's typecheck errors appear.

- [ ] **Step 1: Edit `Invoice` model** — change:

```prisma
  subtotal        Float
  taxRate         Float
  taxAmount       Float
  total           Float
```
to:
```prisma
  subtotal        Decimal   @db.Decimal(12, 2)
  taxRate         Float
  taxAmount       Decimal   @db.Decimal(12, 2)
  total           Decimal   @db.Decimal(12, 2)
```
and:
```prisma
  paidAmount      Float     @default(0)
  remainingAmount Float
```
to:
```prisma
  paidAmount      Decimal   @default(0) @db.Decimal(12, 2)
  remainingAmount Decimal   @db.Decimal(12, 2)
```

- [ ] **Step 2: Edit `PromoCode` model — no change.** Confirm `discount`/`minOrder` are untouched (out of scope).

- [ ] **Step 3: Edit `Company` model** — change:

```prisma
  creditLimit             Float?
  usedCredit              Float           @default(0)
```
to:
```prisma
  creditLimit             Decimal?        @db.Decimal(12, 2)
  usedCredit              Decimal         @default(0) @db.Decimal(12, 2)
```

- [ ] **Step 4: Edit `Product` model** — change:

```prisma
  price               Float
  oldPrice             Float?
```
to:
```prisma
  price               Decimal  @db.Decimal(12, 2)
  oldPrice             Decimal? @db.Decimal(12, 2)
```
(keep column order/alignment as-is otherwise; `rating`/`bonusRate` stay `Float`, out of scope)

- [ ] **Step 5: Edit `Order` model** — change:

```prisma
  subtotal         Float
  tax              Float
  delivery         Float
  deliveryMethod   String
  paymentMethod    String
  promoCode        String?
  discount         Float    @default(0)
  total            Float
```
to:
```prisma
  subtotal         Decimal  @db.Decimal(12, 2)
  tax              Decimal  @db.Decimal(12, 2)
  delivery         Decimal  @db.Decimal(12, 2)
  deliveryMethod   String
  paymentMethod    String
  promoCode        String?
  discount         Decimal  @default(0) @db.Decimal(12, 2)
  total            Decimal  @db.Decimal(12, 2)
```
(`bonusSpent`/`bonusEarned` stay `Float?`, out of scope)

- [ ] **Step 6: Edit `ProductSubscription` model** — change:

```prisma
  pricePerUnit    Float
  discountPercent Float
```
to:
```prisma
  pricePerUnit    Decimal  @db.Decimal(12, 2)
  discountPercent Float
```

- [ ] **Step 7: Edit `ReturnRequest` model** — change:

```prisma
  refundAmount Float
```
to:
```prisma
  refundAmount Decimal  @db.Decimal(12, 2)
```

- [ ] **Step 8: Regenerate the Prisma Client (no DB connection needed — schema-only)**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client ... to .\generated\prisma`

- [ ] **Step 9: Confirm typecheck now fails (expected — this is what Tasks 4/5 fix)**

Run: `npm run typecheck 2>&1 | head -n 5`
Expected: multiple errors like `Type 'Decimal' is not assignable to type 'number'` in files touching `Order`/`Invoice`/`Company`/`Product`/`ProductSubscription`/`ReturnRequest` money fields.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma generated/prisma
git commit -m "feat: change money fields from Float to Decimal(12,2) in schema"
```

---

### Task 4: Fix the known central mappers

**Files:**
- Modify: `lib/orders-data-store.ts:74-104` (`mapDbToServerOrder`)
- Modify: `lib/invoices-data-store.ts:6-26` (`mapDbToInvoice`)
- Modify: `app/api/companies/route.ts:5-25` (`mapCompany`)
- Modify: `lib/product-overrides-store.ts:20-80` (`mapDbToProduct`)
- Modify: `lib/server-pricing.ts:40-58` (`getCatalogPrices`)

**Interfaces:**
- Consumes: `toNum`/`toNumOrNull` from `lib/decimal.ts` (Task 1).
- Produces: no interface changes — these functions keep their exact existing signatures and return types (`ServerOrder`, `Invoice`, the inline `Company` shape, `Product`, `Map<string, CatalogPrice>`); only the money-field values inside now go through an explicit conversion.

- [ ] **Step 1: `lib/orders-data-store.ts` — wrap the 5 Order money fields**

In `mapDbToServerOrder`, change:
```typescript
    items: row.items as ServerOrderItem[],
    subtotal: row.subtotal,
    tax: row.tax,
    delivery: row.delivery,
    deliveryMethod: row.deliveryMethod,
    paymentMethod: row.paymentMethod,
    promoCode: row.promoCode ?? undefined,
    discount: row.discount,
    total: row.total,
```
to:
```typescript
    items: row.items as ServerOrderItem[],
    subtotal: toNum(row.subtotal),
    tax: toNum(row.tax),
    delivery: toNum(row.delivery),
    deliveryMethod: row.deliveryMethod,
    paymentMethod: row.paymentMethod,
    promoCode: row.promoCode ?? undefined,
    discount: toNum(row.discount),
    total: toNum(row.total),
```
and add the import at the top of the file: `import { toNum } from '@/lib/decimal'`.

- [ ] **Step 2: `lib/invoices-data-store.ts` — wrap the 5 Invoice money fields**

In `mapDbToInvoice`, change:
```typescript
    subtotal: row.subtotal,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    total: row.total,
```
to:
```typescript
    subtotal: toNum(row.subtotal),
    taxRate: row.taxRate,
    taxAmount: toNum(row.taxAmount),
    total: toNum(row.total),
```
and:
```typescript
    paidAmount: row.paidAmount,
    remainingAmount: row.remainingAmount,
```
to:
```typescript
    paidAmount: toNum(row.paidAmount),
    remainingAmount: toNum(row.remainingAmount),
```
Add the import: `import { toNum } from '@/lib/decimal'`.

- [ ] **Step 3: `app/api/companies/route.ts` — wrap the 2 Company money fields**

In `mapCompany`, change:
```typescript
    creditLimit: c.creditLimit ?? undefined,
    usedCredit: c.usedCredit,
```
to:
```typescript
    creditLimit: toNumOrNull(c.creditLimit) ?? undefined,
    usedCredit: toNum(c.usedCredit),
```
Add the import: `import { toNum, toNumOrNull } from '@/lib/decimal'`.

- [ ] **Step 4: `lib/product-overrides-store.ts` — wrap the 2 Product money fields**

In `mapDbToProduct`, change:
```typescript
    price: p.price,
    oldPrice: p.oldPrice ?? undefined,
```
to:
```typescript
    price: toNum(p.price),
    oldPrice: toNumOrNull(p.oldPrice) ?? undefined,
```
Add the import: `import { toNum, toNumOrNull } from '@/lib/decimal'`.

- [ ] **Step 5: `lib/server-pricing.ts` — wrap `Product.price` in `getCatalogPrices`**

Change:
```typescript
  const map = new Map<string, CatalogPrice>()
  for (const row of rows) {
    map.set(row.id, {
      price: row.price,
      bulkPricingTiers: sanitizeBulkTiers(row.bulkPricingTiers),
      bonusRate: typeof row.bonusRate === 'number' ? row.bonusRate : 0,
    })
  }
```
to:
```typescript
  const map = new Map<string, CatalogPrice>()
  for (const row of rows) {
    map.set(row.id, {
      price: toNum(row.price),
      bulkPricingTiers: sanitizeBulkTiers(row.bulkPricingTiers),
      bonusRate: typeof row.bonusRate === 'number' ? row.bonusRate : 0,
    })
  }
```
Add the import: `import { toNum } from '@/lib/decimal'`.

- [ ] **Step 6: Run the existing unit tests for these five files (mocked Prisma — no DB needed) and confirm they still pass**

Run: `npx vitest run --config vitest.config.ts lib/server-pricing.test.ts lib/invoices-store.test.ts`
Expected: PASS — these tests mock `prisma.*.findMany`/etc. to return plain numbers directly (e.g. `{ id: 'p1', price: 1000, ... }`), which `toNum`/`toNumOrNull` pass through unchanged (Task 1's defensive pass-through). No test data needs to change.

- [ ] **Step 7: Commit**

```bash
git add lib/orders-data-store.ts lib/invoices-data-store.ts app/api/companies/route.ts lib/product-overrides-store.ts lib/server-pricing.ts
git commit -m "fix: convert Decimal to number in the 5 central money-field mappers"
```

---

### Task 5: Compiler-driven cleanup of remaining typecheck errors

**Files:**
- Modify: whatever `npm run typecheck` still reports after Task 4 (expected: a handful of scattered `Product.price`/`oldPrice` read sites not covered by `mapDbToProduct` or `getCatalogPrices` — candidates found during design research: `app/api/admin/products/search/route.ts`, `app/api/brands/route.ts`, `app/api/v1/orders/route.ts`; there may be others tsc finds that weren't anticipated).

**Interfaces:**
- Consumes: `toNum`/`toNumOrNull` from `lib/decimal.ts` (Task 1).
- Produces: nothing new — same pattern as Task 4, applied wherever the compiler still points.

- [ ] **Step 1: Run typecheck and capture the remaining error list**

Run: `npm run typecheck 2>&1 | grep -B1 "error TS2322\|error TS2365\|error TS2367" `
Expected: a list of `file.ts:line` locations, each about a `Decimal` vs `number` (or arithmetic on `Decimal`) mismatch.

- [ ] **Step 2: For each reported location, apply the fix pattern**

For a **read** that assigns/returns the raw field directly (e.g. `price: row.price`), wrap it: `price: toNum(row.price)` (or `toNumOrNull` if the field is nullable). For a **read used in arithmetic** (e.g. `row.price * quantity`), wrap the read: `toNum(row.price) * quantity`. Import `{ toNum, toNumOrNull }` from `@/lib/decimal` at the top of each touched file. Do **not** touch any `create`/`update`/`upsert` `data: {...}` block — Prisma already accepts a plain `number` there for a `Decimal` field, so write sites never show an error and never need a change.

- [ ] **Step 3: Re-run typecheck after each fix, repeat Step 2 until clean**

Run: `npm run typecheck`
Expected: eventually, exit with no output (0 errors).

- [ ] **Step 4: Run the full unit and integration suites**

Run: `npm run test:unit && npm run test:integration`
Expected: PASS, same counts as before this plan started (531 unit / 6 integration at time of writing) — this task changes no business logic, only where a `Decimal` gets converted to `number`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: convert remaining Decimal money fields flagged by typecheck"
```

---

### Task 6: Pre-migration snapshot script

**Files:**
- Create: `scripts/_tmp_money_snapshot.ts` (temporary — deleted in Task 9)

**Interfaces:**
- Consumes: `DATABASE_URL` env var (already required by every other script in this repo).
- Produces: `C:/Temp/money-migration-snapshot.json` — read by Task 7's reconciliation step.

- [ ] **Step 1: Write the script**

```typescript
// scripts/_tmp_money_snapshot.ts
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { writeFileSync } from 'node:fs'

neonConfig.webSocketConstructor = ws

const TABLES: Record<string, string[]> = {
  Order: ['subtotal', 'tax', 'delivery', 'discount', 'total'],
  Invoice: ['subtotal', 'taxAmount', 'total', 'paidAmount', 'remainingAmount'],
  Company: ['creditLimit', 'usedCredit'],
  Product: ['price', 'oldPrice'],
  ProductSubscription: ['pricePerUnit'],
  ReturnRequest: ['refundAmount'],
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const snapshot: Record<string, Array<Record<string, unknown>>> = {}
  for (const [table, fields] of Object.entries(TABLES)) {
    const cols = ['id', ...fields].map((c) => `"${c}"`).join(', ')
    const { rows } = await pool.query(`SELECT ${cols} FROM "${table}"`)
    snapshot[table] = rows
  }
  writeFileSync('C:/Temp/money-migration-snapshot.json', JSON.stringify(snapshot))
  console.log(
    'Snapshot written:',
    Object.entries(snapshot).map(([t, r]) => `${t}=${r.length}`).join(', ')
  )
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Run it against the live Neon DB (BEFORE the migration in Task 7)**

Run: `npx tsx --env-file=.env --env-file=.env.local scripts/_tmp_money_snapshot.ts`
Expected: `Snapshot written: Order=<N>, Invoice=<N>, Company=<N>, Product=<N>, ProductSubscription=<N>, ReturnRequest=<N>` with real counts, and the file exists at `C:\Temp\money-migration-snapshot.json`.

- [ ] **Step 3: Commit (the script only — it's deleted in Task 9, but keep the intermediate diff clean)**

```bash
git add scripts/_tmp_money_snapshot.ts
git commit -m "chore: add pre-migration money snapshot script"
```

---

### Task 7: Apply the migration to Neon + reconciliation

**Files:**
- Create: `prisma/migrations/<timestamp>_money_decimal_storage/migration.sql`
- Create: `scripts/_tmp_money_reconcile.ts` (temporary — deleted in Task 9)

**Interfaces:**
- Consumes: `C:/Temp/money-migration-snapshot.json` from Task 6.
- Produces: the live Neon DB with all 16 columns as `numeric(12,2)`.

- [ ] **Step 1: Generate the migration SQL from the live DB vs schema.prisma**

Run: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected output (verify it matches this shape — 6 `ALTER TABLE` blocks, one per model, one `ALTER COLUMN ... TYPE numeric(12,2) USING ROUND(...)` line per field):

```sql
ALTER TABLE "Order"
  ALTER COLUMN "subtotal" TYPE numeric(12,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "tax" TYPE numeric(12,2) USING ROUND("tax"::numeric, 2),
  ALTER COLUMN "delivery" TYPE numeric(12,2) USING ROUND("delivery"::numeric, 2),
  ALTER COLUMN "discount" TYPE numeric(12,2) USING ROUND("discount"::numeric, 2),
  ALTER COLUMN "total" TYPE numeric(12,2) USING ROUND("total"::numeric, 2);

ALTER TABLE "Invoice"
  ALTER COLUMN "subtotal" TYPE numeric(12,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "taxAmount" TYPE numeric(12,2) USING ROUND("taxAmount"::numeric, 2),
  ALTER COLUMN "total" TYPE numeric(12,2) USING ROUND("total"::numeric, 2),
  ALTER COLUMN "paidAmount" TYPE numeric(12,2) USING ROUND("paidAmount"::numeric, 2),
  ALTER COLUMN "remainingAmount" TYPE numeric(12,2) USING ROUND("remainingAmount"::numeric, 2);

ALTER TABLE "Company"
  ALTER COLUMN "creditLimit" TYPE numeric(12,2) USING ROUND("creditLimit"::numeric, 2),
  ALTER COLUMN "usedCredit" TYPE numeric(12,2) USING ROUND("usedCredit"::numeric, 2);

ALTER TABLE "Product"
  ALTER COLUMN "price" TYPE numeric(12,2) USING ROUND("price"::numeric, 2),
  ALTER COLUMN "oldPrice" TYPE numeric(12,2) USING ROUND("oldPrice"::numeric, 2);

ALTER TABLE "ProductSubscription"
  ALTER COLUMN "pricePerUnit" TYPE numeric(12,2) USING ROUND("pricePerUnit"::numeric, 2);

ALTER TABLE "ReturnRequest"
  ALTER COLUMN "refundAmount" TYPE numeric(12,2) USING ROUND("refundAmount"::numeric, 2);
```

If Prisma's actual output differs in cosmetic ways (column grouping, quoting) that's fine — what matters is every one of the 16 `ALTER COLUMN` lines is present with `USING ROUND(...::numeric, 2)` (not a bare `USING "col"::numeric`, which would skip the drift cleanup described in the design doc).

- [ ] **Step 2: Write the migration file**

Create folder: `mkdir -p prisma/migrations/<YYYYMMDDHHMMSS>_money_decimal_storage` (use the current timestamp, following the existing folder-naming convention — see other folders under `prisma/migrations/`). Write the SQL from Step 1 into `prisma/migrations/<timestamp>_money_decimal_storage/migration.sql`, using the `Write` tool directly (not shell redirection — `prisma migrate diff`'s own log lines leak into stdout and corrupt a redirected file, as noted in memory `project-migration-workflow-broken`).

- [ ] **Step 3: Apply it to the live Neon DB**

Run: `npx prisma db execute --file prisma/migrations/<timestamp>_money_decimal_storage/migration.sql`
Expected: `Script executed successfully.`

- [ ] **Step 4: Mark it applied in Prisma's migration history**

Run: `npx prisma migrate resolve --applied <timestamp>_money_decimal_storage`
Expected: `Migration <timestamp>_money_decimal_storage marked as applied.`

- [ ] **Step 5: Regenerate the client (schema unchanged since Task 3, but confirms nothing drifted)**

Run: `npx prisma generate`

- [ ] **Step 6: Write and run the reconciliation script**

```typescript
// scripts/_tmp_money_reconcile.ts
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { readFileSync } from 'node:fs'

neonConfig.webSocketConstructor = ws

const TABLES: Record<string, string[]> = {
  Order: ['subtotal', 'tax', 'delivery', 'discount', 'total'],
  Invoice: ['subtotal', 'taxAmount', 'total', 'paidAmount', 'remainingAmount'],
  Company: ['creditLimit', 'usedCredit'],
  Product: ['price', 'oldPrice'],
  ProductSubscription: ['pricePerUnit'],
  ReturnRequest: ['refundAmount'],
}

async function main() {
  const before = JSON.parse(
    readFileSync('C:/Temp/money-migration-snapshot.json', 'utf-8')
  ) as Record<string, Array<Record<string, unknown>>>
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  let mismatches = 0

  for (const [table, fields] of Object.entries(TABLES)) {
    const cols = ['id', ...fields].map((c) => `"${c}"`).join(', ')
    const { rows: afterRows } = await pool.query(`SELECT ${cols} FROM "${table}"`)
    const afterById = new Map(afterRows.map((r) => [r.id as string, r]))

    for (const beforeRow of before[table]) {
      const afterRow = afterById.get(beforeRow.id as string)
      if (!afterRow) {
        console.log(`${table} ${beforeRow.id}: row missing after migration!`)
        mismatches++
        continue
      }
      for (const field of fields) {
        const b = beforeRow[field] === null ? null : Number(beforeRow[field])
        const a = afterRow[field] === null ? null : Number(afterRow[field])
        if (b === null && a === null) continue
        if (b === null || a === null || Math.abs(b - a) > 0.005) {
          console.log(`${table} ${beforeRow.id}.${field}: ${b} -> ${a}`)
          mismatches++
        }
      }
    }
  }

  console.log(mismatches === 0 ? 'All values match within a cent.' : `${mismatches} mismatch(es) — see above.`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

Run: `npx tsx --env-file=.env --env-file=.env.local scripts/_tmp_money_reconcile.ts`
Expected: `All values match within a cent.` Any printed mismatch line is either (a) pre-existing float drift the `ROUND` cleaned up — fine, just note it — or (b) a real bug if the same row shows a difference bigger than a cent or a row goes missing — stop and investigate before continuing if so.

- [ ] **Step 7: Commit the migration folder (not the `_tmp_` reconcile script — that's deleted in Task 9)**

```bash
git add prisma/migrations/
git commit -m "feat: apply money Decimal(12,2) migration to Neon"
```

---

### Task 8: Full regression + live smoke test

**Files:** none created/modified — verification only.

- [ ] **Step 1: Full automated regression**

Run: `npm run lint && npm run typecheck && npm run test:unit && npm run test:integration`
Expected: lint 0 errors, typecheck clean, all unit/integration tests passing.

- [ ] **Step 2: Restart the dev server (picks up the regenerated Prisma client)**

Find and kill whatever holds port 3000 (`netstat -ano | findstr :3000`, then `taskkill //PID <pid> //F`), then `rm -f .next/dev/lock && npm run dev` in the background, wait for it to respond on `http://localhost:3000/`.

- [ ] **Step 3: Confirm a Product-returning API route now returns real JSON numbers, not stringified decimals**

Run: `curl -s http://localhost:3000/api/products/bestsellers | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const p=d.products?.[0]; console.log(typeof p?.price, p?.price)"`
Expected: `number <some value>` — if it prints `string "12.34"` (quoted), the extension isn't wired correctly; go back to Task 2.

- [ ] **Step 4: Confirm `lib/tax.ts`'s `isOrderTaxIncluded` heuristic still works on real data**

Create a throwaway order via `POST /api/orders` (see `verify` skill for the exact payload shape), then `GET /api/orders/<id>` and confirm `total`/`tax`/`subtotal` come back as numbers and the order detail page (`/[lang]/order/<id>`) renders the VAT line without error. Delete the test order afterward (`DELETE FROM "Order" WHERE id = '<id>'` via a `scripts/_tmp_*.ts` `Pool` script, per the `verify` skill's DB-cleanup pattern) — this is real Neon data, not a mock.

- [ ] **Step 5: No commit for this task (verification only)**

---

### Task 9: Deploy and clean up

**Files:**
- Delete: `scripts/_tmp_money_snapshot.ts`, `scripts/_tmp_money_reconcile.ts`

- [ ] **Step 1: Push everything so far**

Run: `git push origin main`

- [ ] **Step 2: Wait for the Vercel deploy, then confirm it's live**

Poll `https://hairshop-pro.lv.vercel.app/api/products/bestsellers` the same way as Task 8 Step 3 (real number, not a string) — this is the "new code is live" signal for this change (there's no CSP-header-style marker like the A1 deploy check, since this change doesn't touch `next.config.js`).

- [ ] **Step 3: Delete the temporary scripts and commit**

```bash
rm -f scripts/_tmp_money_snapshot.ts scripts/_tmp_money_reconcile.ts
git add -A
git commit -m "chore: remove temporary money-migration scripts"
git push origin main
```

- [ ] **Step 4: Update memory**

Add a note to the security-audit memory (or a new dedicated one) recording: migration applied (timestamp/folder name), reconciliation result (clean, or what mismatches were found and why), and that B1 is now fully closed.
