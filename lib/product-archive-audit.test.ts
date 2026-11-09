import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

type Archived = {
  id: string
  product: Record<string, unknown>
  source: 'base' | 'custom'
  deletedAt: string
}

type AuditRow = {
  actorId: string
  requestId: string | null
  input: Record<string, unknown>
}

type State = {
  archive: Archived[]
  overrides: Record<string, Record<string, unknown>>
  products: Record<string, Record<string, unknown>>
  audits: AuditRow[]
}

const harness = vi.hoisted(() => ({
  state: { archive: [], overrides: {}, products: {}, audits: [] } as State,
  failAudit: false,
  tail: Promise.resolve() as Promise<void>,
}))

function cloneState(state: State): State {
  return structuredClone(state)
}

vi.mock('@/lib/prisma', () => {
  function txClient(staged: State) {
    return {
      __audits: staged.audits,
      $executeRaw: vi.fn(async () => 1),
      keyValueSetting: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
          if (where.key === 'deleted-products-archive') {
            return { key: where.key, value: cloneState(staged).archive, updatedAt: new Date() }
          }
          if (where.key === 'product-overrides') {
            return Object.keys(staged.overrides).length > 0
              ? { key: where.key, value: structuredClone(staged.overrides), updatedAt: new Date() }
              : null
          }
          return null
        }),
        upsert: vi.fn(async (args: { where: { key: string }; update: { value: unknown } }) => {
          if (args.where.key === 'deleted-products-archive') {
            staged.archive = structuredClone(args.update.value) as Archived[]
          } else if (args.where.key === 'product-overrides') {
            staged.overrides = structuredClone(args.update.value) as State['overrides']
          }
          return {}
        }),
      },
      product: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          staged.products[String(data.id)] = structuredClone(data)
          return data
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const current = staged.products[where.id]
          if (!current) throw new Error('product not found')
          staged.products[where.id] = { ...current, ...structuredClone(data) }
          return staged.products[where.id]
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => staged.products[where.id] ?? null),
        findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; isDeleted: boolean } }) => (
          where.id.in.map((id) => staged.products[id]).filter((product) => product && product.isDeleted === where.isDeleted)
        )),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const current = staged.products[where.id]
          delete staged.products[where.id]
          return current
        }),
        deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
          for (const id of where.id.in) delete staged.products[id]
          return { count: where.id.in.length }
        }),
        updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
          for (const id of where.id.in) staged.products[id] = { ...staged.products[id], ...structuredClone(data) }
          return { count: where.id.in.length }
        }),
      },
    }
  }

  const prisma = {
    $transaction: vi.fn(async (run: (tx: ReturnType<typeof txClient>) => Promise<unknown>) => {
      let release!: () => void
      const previous = harness.tail
      harness.tail = new Promise<void>((resolve) => { release = resolve })
      await previous
      const staged = cloneState(harness.state)
      try {
        const result = await run(txClient(staged))
        harness.state = staged
        return result
      } finally {
        release()
      }
    }),
    product: {
      findMany: vi.fn(async () => Object.values(harness.state.products).filter((product) => !product.isDeleted)),
    },
    keyValueSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        if (where.key === 'product-overrides') {
          return Object.keys(harness.state.overrides).length > 0
            ? { key: where.key, value: structuredClone(harness.state.overrides), updatedAt: new Date() }
            : null
        }
        return null
      }),
    },
  }
  return { prisma }
})

vi.mock('@/lib/server-audit', () => ({
  appendServerAudit: vi.fn(async (
    tx: { __audits: AuditRow[] },
    request: NextRequest,
    actor: { id: string },
    input: Record<string, unknown>,
  ) => {
    if (harness.failAudit) throw new Error('audit unavailable')
    tx.__audits.push({
      actorId: actor.id,
      requestId: typeof input.requestId === 'string' ? input.requestId : request.headers.get('x-request-id'),
      input,
    })
  }),
}))

import {
  deleteProductAny,
  deleteProductsAny,
  purgeDeletedProductArchive,
  resetProductOverride,
  restoreDeletedProduct,
} from '@/lib/product-overrides-store'

const actor = { id: 'admin-1', email: 'admin@example.test' } as never

function request(path: string, requestId?: string): NextRequest {
  return new NextRequest(`https://shop.test${path}`, {
    headers: requestId ? { 'x-request-id': requestId } : undefined,
  })
}

function archived(id: string, source: 'base' | 'custom' = 'custom'): Archived {
  return {
    id,
    source,
    deletedAt: '2026-11-09T10:00:00.000Z',
    product: {
      id,
      title: `Product ${id}`,
      brand: 'Hairshop',
      price: 12.5,
      rating: 0,
      category: 'hair',
      stock: 2,
    },
  }
}

function activeProduct(id: string, isCustom = false): Record<string, unknown> {
  return {
    id,
    title: `Product ${id}`,
    brand: 'Hairshop',
    price: 12.5,
    rating: 0,
    category: 'hair',
    stock: 2,
    isCustom,
    isDeleted: false,
  }
}

beforeEach(() => {
  harness.state = { archive: [], overrides: {}, products: {}, audits: [] }
  harness.failAudit = false
  harness.tail = Promise.resolve()
  vi.clearAllMocks()
})

describe('product archive permanent audit', () => {
  it('restores the archived product and records the authenticated actor and transition', async () => {
    harness.state.archive = [archived('p1')]

    const result = await restoreDeletedProduct('p1', {
      actor,
      request: request('/api/admin/products/restore'),
    })

    expect(result).toEqual({ success: true })
    expect(harness.state.archive).toEqual([])
    expect(harness.state.products.p1).toMatchObject({ id: 'p1', isDeleted: false, isCustom: true })
    expect(harness.state.audits).toEqual([expect.objectContaining({
      actorId: 'admin-1',
      input: expect.objectContaining({
        action: 'product.restored',
        entityType: 'product',
        entityId: 'p1',
        entityTitle: 'Product p1',
        before: { archived: true, source: 'custom', deletedAt: '2026-11-09T10:00:00.000Z' },
        after: { archived: false, source: 'custom' },
      }),
    })])
  })

  it('serializes concurrent restore retries and writes only one event for the real change', async () => {
    harness.state.archive = [archived('p1')]
    const audit = { actor, request: request('/api/admin/products/restore') }

    const results = await Promise.all([
      restoreDeletedProduct('p1', audit),
      restoreDeletedProduct('p1', audit),
    ])

    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(harness.state.audits).toHaveLength(1)
    expect(harness.state.audits[0].input).toMatchObject({ action: 'product.restored', entityId: 'p1' })
  })

  it('rolls back restoration when the audit append fails', async () => {
    harness.state.archive = [archived('p1')]
    harness.failAudit = true

    await expect(restoreDeletedProduct('p1', {
      actor,
      request: request('/api/admin/products/restore'),
    })).rejects.toThrow('audit unavailable')

    expect(harness.state.archive.map((item) => item.id)).toEqual(['p1'])
    expect(harness.state.products).toEqual({})
    expect(harness.state.audits).toEqual([])
  })

  it('permanently removes one archive entry and records the minimal deletion context', async () => {
    harness.state.archive = [archived('p1'), archived('p2', 'base')]

    const result = await purgeDeletedProductArchive('p1', {
      actor,
      request: request('/api/admin/products/archive'),
    })

    expect(result).toMatchObject({ success: true, archive: [{ id: 'p2' }] })
    expect(harness.state.audits[0]).toMatchObject({
      actorId: 'admin-1',
      input: {
        action: 'product.permanently_deleted',
        entityType: 'product',
        entityId: 'p1',
        entityTitle: 'Product p1',
        before: { archived: true, source: 'custom', deletedAt: '2026-11-09T10:00:00.000Z' },
        after: { archived: false, permanentlyDeleted: true, source: 'custom' },
      },
    })
  })

  it('serializes concurrent permanent-delete retries without a phantom event', async () => {
    harness.state.archive = [archived('p1')]
    const audit = { actor, request: request('/api/admin/products/archive') }

    const results = await Promise.all([
      purgeDeletedProductArchive('p1', audit),
      purgeDeletedProductArchive('p1', audit),
    ])

    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(harness.state.audits).toHaveLength(1)
    expect(harness.state.audits[0].input).toMatchObject({ action: 'product.permanently_deleted', entityId: 'p1' })
  })

  it('records only changed batch items and keeps their shared request id', async () => {
    harness.state.archive = [archived('p1'), archived('p2', 'base')]
    const requestId = 'archive-batch-123'

    const results = await Promise.all(['p1', 'missing', 'p2'].map((id) => purgeDeletedProductArchive(id, {
      actor,
      request: request('/api/admin/products/archive', requestId),
    })))

    expect(results.map((result) => result.success)).toEqual([true, false, true])
    expect(harness.state.archive).toEqual([])
    expect(harness.state.audits.map((row) => row.input.entityId).sort()).toEqual(['p1', 'p2'])
    expect(new Set(harness.state.audits.map((row) => row.requestId))).toEqual(new Set([requestId]))
  })

  it('rolls back permanent deletion when the audit append fails', async () => {
    harness.state.archive = [archived('p1')]
    harness.failAudit = true

    await expect(purgeDeletedProductArchive('p1', {
      actor,
      request: request('/api/admin/products/archive'),
    })).rejects.toThrow('audit unavailable')

    expect(harness.state.archive.map((item) => item.id)).toEqual(['p1'])
    expect(harness.state.audits).toEqual([])
  })
})

describe('product archive move and override reset audit', () => {
  it('moves one base product to the archive and records the real transition', async () => {
    harness.state.products.p1 = activeProduct('p1')

    const result = await deleteProductAny('p1', {
      actor,
      request: request('/api/admin/products'),
    })

    expect(result.success).toBe(true)
    expect(harness.state.products.p1.isDeleted).toBe(true)
    expect(harness.state.archive).toHaveLength(1)
    expect(harness.state.archive[0]).toMatchObject({ id: 'p1', source: 'base' })
    expect(harness.state.audits[0]).toMatchObject({
      actorId: 'admin-1',
      input: {
        action: 'product.archived',
        entityType: 'product',
        entityId: 'p1',
        entityTitle: 'Product p1',
        before: { archived: false, source: 'base' },
        after: expect.objectContaining({ archived: true, source: 'base' }),
      },
    })
  })

  it('serializes concurrent archive retries without replacing the real event', async () => {
    harness.state.products.p1 = activeProduct('p1')
    const audit = { actor, request: request('/api/admin/products') }

    const results = await Promise.all([
      deleteProductAny('p1', audit),
      deleteProductAny('p1', audit),
    ])

    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(harness.state.archive).toHaveLength(1)
    expect(harness.state.audits).toHaveLength(1)
  })

  it('rolls back the product and archive when archive-move audit fails', async () => {
    harness.state.products.p1 = activeProduct('p1')
    harness.failAudit = true

    await expect(deleteProductAny('p1', {
      actor,
      request: request('/api/admin/products'),
    })).rejects.toThrow('audit unavailable')

    expect(harness.state.products.p1.isDeleted).toBe(false)
    expect(harness.state.archive).toEqual([])
    expect(harness.state.audits).toEqual([])
  })

  it('archives every changed bulk item with one shared request id', async () => {
    harness.state.products.p1 = activeProduct('p1')
    harness.state.products.p2 = activeProduct('p2', true)

    const result = await deleteProductsAny(['p1', 'p2'], {
      actor,
      request: request('/api/admin/products'),
    })

    expect(result).toEqual({ success: true, deletedCount: 2 })
    expect(harness.state.archive.map((item) => item.id).sort()).toEqual(['p1', 'p2'])
    expect(harness.state.products.p1.isDeleted).toBe(true)
    expect(harness.state.products.p2).toBeUndefined()
    expect(harness.state.audits.map((row) => row.input.entityId).sort()).toEqual(['p1', 'p2'])
    expect(harness.state.audits[0].requestId).toBeTruthy()
    expect(new Set(harness.state.audits.map((row) => row.requestId)).size).toBe(1)
  })

  it('keeps bulk archive atomic when one selected id is missing', async () => {
    harness.state.products.p1 = activeProduct('p1')

    const result = await deleteProductsAny(['p1', 'missing'], {
      actor,
      request: request('/api/admin/products'),
    })

    expect(result.success).toBe(false)
    expect(harness.state.products.p1.isDeleted).toBe(false)
    expect(harness.state.archive).toEqual([])
    expect(harness.state.audits).toEqual([])
  })

  it('resets an existing override once and does not audit the repeat', async () => {
    harness.state.products.p1 = activeProduct('p1')
    harness.state.overrides = { p1: { price: 99 }, p2: { title: 'Keep' } }
    const audit = { actor, request: request('/api/admin/products') }

    await resetProductOverride('p1', audit)
    await resetProductOverride('p1', audit)

    expect(harness.state.overrides).toEqual({ p2: { title: 'Keep' } })
    expect(harness.state.audits).toHaveLength(1)
    expect(harness.state.audits[0]).toMatchObject({
      actorId: 'admin-1',
      input: {
        action: 'product.override_reset',
        entityType: 'product',
        entityId: 'p1',
        entityTitle: 'Product p1',
        before: { override: { price: 99 } },
        after: { override: null },
      },
    })
  })

  it('rolls back an override reset when its audit append fails', async () => {
    harness.state.products.p1 = activeProduct('p1')
    harness.state.overrides = { p1: { price: 99 } }
    harness.failAudit = true

    await expect(resetProductOverride('p1', {
      actor,
      request: request('/api/admin/products'),
    })).rejects.toThrow('audit unavailable')

    expect(harness.state.overrides).toEqual({ p1: { price: 99 } })
    expect(harness.state.audits).toEqual([])
  })
})
