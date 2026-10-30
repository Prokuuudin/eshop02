import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Client } from 'pg'
import { prisma } from '@/lib/prisma'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/observability', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/observability')>()
  return {
    ...actual,
    logOperationalEvent: vi.fn((event: { level?: string; event: string }, error?: unknown) => {
      if (event.level === 'error') console.error(event.event, error)
    }),
  }
})

import { POST } from '@/app/api/internal/hairshop-catalog-sync/route'

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('ep-long-glitter')) {
  throw new Error('Refusing to run the v1 lock suite against the production database')
}

const SECRET = 'v1-lock-integration-secret-'.padEnd(48, 'x')
const LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('hairshop-catalog-new-products'))"
// Product IDs nop390-99999xxxx are reserved for this suite and removed around every test.
const TEST_ID_PREFIX = 'nop390-99999'

function candidate(legacyProductId: number) {
  return {
    legacyProductId, sku: `IT-V1-LOCK-${legacyProductId}`, ean: null, published: true,
    titles: { default: `Lock probe ${legacyProductId}` }, descriptions: {}, categoryNames: [], manufacturerName: null,
    images: [], createdOnUtc: '2026-01-01T00:00:00.000Z', updatedOnUtc: '2026-10-30T15:00:00.000Z',
  }
}

async function apply(runId: string, legacyIds: number[]): Promise<{ status: number; statuses: string[] }> {
  const response = await POST(new NextRequest('http://localhost/api/internal/hairshop-catalog-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hairshop-catalog-sync-key': SECRET },
    body: JSON.stringify({ schemaVersion: 1, runId, mode: 'apply', products: legacyIds.map(candidate) }),
  }))
  const json = await response.json() as { results?: Array<{ status: string }> }
  return { status: response.status, statuses: (json.results ?? []).map(result => result.status) }
}

async function pendingFor<T>(promise: Promise<T>, ms: number): Promise<boolean> {
  const marker = Symbol('pending')
  const winner = await Promise.race([promise.then(() => null, () => null), new Promise(resolve => setTimeout(() => resolve(marker), ms))])
  return winner === marker
}

async function lockIsFree(): Promise<boolean> {
  const rows = await prisma.$transaction(tx => tx.$queryRaw<Array<{ free: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('hairshop-catalog-new-products')) AS free`)
  return rows[0].free
}

async function cleanup(): Promise<void> {
  await prisma.product.deleteMany({ where: { id: { startsWith: TEST_ID_PREFIX } } })
}

beforeAll(() => {
  process.env.HAIRSHOP_CATALOG_SYNC_SECRET = SECRET
  process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
})
beforeEach(cleanup)
afterAll(async () => {
  await cleanup()
  delete process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED
})

describe('v1 new-product apply lock (isolated Postgres)', () => {
  it('applies through the real Neon adapter and creates a product without price or stock', async () => {
    expect(await apply('it-v1-lock-apply-0001', [999_990_001])).toEqual({ status: 200, statuses: ['created'] })
    expect(await prisma.product.findUniqueOrThrow({ where: { id: 'nop390-999990001' }, select: { price: true, stock: true, erpPriceMissing: true, grinsStock: true } }))
      .toMatchObject({ stock: 0, erpPriceMissing: true, grinsStock: null })
    expect(await apply('it-v1-lock-apply-0002', [999_990_001])).toEqual({ status: 200, statuses: ['already_exists'] })
    expect(await lockIsFree()).toBe(true)
  })

  it('creates a product exactly once under concurrent identical applies', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => apply(`it-v1-lock-race-000${index}`, [999_990_002])))
    expect(results.every(result => result.status === 200)).toBe(true)
    expect(results.flatMap(result => result.statuses).filter(status => status === 'created')).toHaveLength(1)
    expect(results.flatMap(result => result.statuses).filter(status => status === 'already_exists')).toHaveLength(5)
    expect(await prisma.product.count({ where: { id: 'nop390-999990002' } })).toBe(1)
    expect(await lockIsFree()).toBe(true)
  })

  it('waits for a holder of the same lock and proceeds after the holder aborts', async () => {
    let locked!: () => void
    let crash!: () => void
    const acquired = new Promise<void>(resolve => { locked = resolve })
    const crashGate = new Promise<void>(resolve => { crash = resolve })
    const holder = prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(LOCK_SQL)
      locked()
      await crashGate
      throw new Error('simulated crash while holding the lock')
    }, { maxWait: 10_000, timeout: 60_000 }).catch((error: Error) => error.message)
    await acquired

    const waiting = apply('it-v1-lock-wait-0001', [999_990_003])
    expect(await pendingFor(waiting, 2_500)).toBe(true)
    expect(await prisma.product.count({ where: { id: 'nop390-999990003' } })).toBe(0)

    crash()
    expect(await holder).toBe('simulated crash while holding the lock')
    expect(await waiting).toEqual({ status: 200, statuses: ['created'] })
    expect(await lockIsFree()).toBe(true)
  })

  it('releases the lock when the holding connection dies mid-transaction', async () => {
    const holder = new Client({ connectionString: process.env.DATABASE_URL!.replace('-pooler.', '.') })
    holder.on('error', () => undefined)
    await holder.connect()
    await holder.query('BEGIN')
    await holder.query(LOCK_SQL)

    const waiting = apply('it-v1-lock-kill-0001', [999_990_004])
    expect(await pendingFor(waiting, 2_500)).toBe(true)

    // Abrupt process death: drop the socket without COMMIT/ROLLBACK.
    ;(holder as unknown as { connection: { stream: { destroy(): void } } }).connection.stream.destroy()
    expect(await waiting).toEqual({ status: 200, statuses: ['created'] })
    expect(await lockIsFree()).toBe(true)
  })
})
