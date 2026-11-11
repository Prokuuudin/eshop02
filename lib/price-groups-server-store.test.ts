import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

type Group = {
  id: string
  name: string
  description: string
  multiplier: number
  color: string
  createdAt: string
}

type Override = { groupId: string; productId: string; price: number }
type Audit = { actorId: string; input: Record<string, unknown> }
type State = { data: { groups: Group[]; overrides: Override[] } | null; audits: Audit[] }

const harness = vi.hoisted(() => ({
  state: { data: null, audits: [] } as State,
  fallback: { groups: [], overrides: [] } as { groups: Group[]; overrides: Override[] },
  failAudit: false,
  tail: Promise.resolve() as Promise<void>,
}))

function clone<T>(value: T): T {
  return structuredClone(value)
}

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(async () => JSON.stringify(harness.fallback)),
  },
}))

vi.mock('@/lib/prisma', () => {
  function txClient(staged: State) {
    return {
      __audits: staged.audits,
      $executeRaw: vi.fn(async () => 1),
      keyValueSetting: {
        findUnique: vi.fn(async () => staged.data
          ? { key: 'price-groups', value: clone(staged.data), updatedAt: new Date() }
          : null),
        upsert: vi.fn(async (args: { update: { value: unknown } }) => {
          staged.data = clone(args.update.value) as State['data']
          return {}
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
      const staged = clone(harness.state)
      try {
        const result = await run(txClient(staged))
        harness.state = staged
        return result
      } finally {
        release()
      }
    }),
    keyValueSetting: {
      findUnique: vi.fn(async () => harness.state.data
        ? { key: 'price-groups', value: clone(harness.state.data), updatedAt: new Date() }
        : null),
    },
  }
  return { prisma }
})

vi.mock('@/lib/server-audit', () => ({
  appendServerAudit: vi.fn(async (
    tx: { __audits: Audit[] },
    _request: NextRequest,
    actor: { id: string },
    input: Record<string, unknown>,
  ) => {
    if (harness.failAudit) throw new Error('audit unavailable')
    tx.__audits.push({ actorId: actor.id, input })
  }),
}))

import {
  createPriceGroup,
  deletePriceGroup,
  removeOverride,
  setOverride,
  updatePriceGroup,
} from '@/lib/price-groups-server-store'

const audit = {
  actor: { id: 'admin-1', email: 'admin@example.test' } as never,
  request: new NextRequest('https://shop.test/api/admin/price-groups'),
}

function group(id = 'g1'): Group {
  return {
    id,
    name: `Group ${id}`,
    description: 'Description',
    multiplier: 0.9,
    color: '#112233',
    createdAt: '2026-11-09T10:00:00.000Z',
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  harness.state = { data: null, audits: [] }
  harness.fallback = { groups: [], overrides: [] }
  harness.failAudit = false
  harness.tail = Promise.resolve()
  vi.clearAllMocks()
})

describe('price-group transactional audit', () => {
  it('serializes concurrent creates without losing a group or reusing an id', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    const results = await Promise.all([
      createPriceGroup({ name: 'A', description: '', multiplier: 1, color: '#111111' }, audit),
      createPriceGroup({ name: 'B', description: '', multiplier: 0.8, color: '#222222' }, audit),
    ])

    expect(results.every((result) => result.success)).toBe(true)
    expect(harness.state.data?.groups.map((item) => item.name).sort()).toEqual(['A', 'B'])
    expect(new Set(harness.state.data?.groups.map((item) => item.id)).size).toBe(2)
    expect(harness.state.audits).toHaveLength(2)
    expect(harness.state.audits.map((row) => row.input.action)).toEqual([
      'price_group.created',
      'price_group.created',
    ])
  })

  it('records only changed group fields and skips an identical repeat', async () => {
    harness.state.data = { groups: [group()], overrides: [] }
    const updates = { name: 'VIP', description: 'Description', multiplier: 0.9, color: '#112233' }

    await updatePriceGroup('g1', updates, audit)
    await updatePriceGroup('g1', updates, audit)

    expect(harness.state.data.groups[0].name).toBe('VIP')
    expect(harness.state.audits).toEqual([{
      actorId: 'admin-1',
      input: expect.objectContaining({
        action: 'price_group.updated',
        entityId: 'g1',
        before: { name: 'Group g1' },
        after: { name: 'VIP' },
      }),
    }])
  })

  it('deletes a group and its prices once, including removed prices in the event', async () => {
    harness.state.data = {
      groups: [group()],
      overrides: [
        { groupId: 'g1', productId: 'p1', price: 10 },
        { groupId: 'g1', productId: 'p2', price: 20 },
      ],
    }

    await deletePriceGroup('g1', audit)
    await deletePriceGroup('g1', audit)

    expect(harness.state.data).toEqual({ groups: [], overrides: [] })
    expect(harness.state.audits).toHaveLength(1)
    expect(harness.state.audits[0].input).toMatchObject({
      action: 'price_group.deleted',
      entityId: 'g1',
      before: {
        group: { name: 'Group g1', description: 'Description', multiplier: 0.9, color: '#112233' },
        overrides: [{ productId: 'p1', price: 10 }, { productId: 'p2', price: 20 }],
      },
      after: { group: null, overrides: [] },
    })
  })

  it('records setting, changing and removing an individual price without no-op duplicates', async () => {
    harness.state.data = { groups: [group()], overrides: [] }

    await setOverride('g1', 'p1', 10, audit)
    await setOverride('g1', 'p1', 10, audit)
    await setOverride('g1', 'p1', 12, audit)
    await removeOverride('g1', 'p1', audit)
    await removeOverride('g1', 'p1', audit)

    expect(harness.state.data.overrides).toEqual([])
    expect(harness.state.audits.map((row) => row.input)).toMatchObject([
      { action: 'price_group.product_price_set', entityId: 'g1:p1', before: { groupId: 'g1', productId: 'p1', price: null }, after: { groupId: 'g1', productId: 'p1', price: 10 } },
      { action: 'price_group.product_price_set', entityId: 'g1:p1', before: { groupId: 'g1', productId: 'p1', price: 10 }, after: { groupId: 'g1', productId: 'p1', price: 12 } },
      { action: 'price_group.product_price_removed', entityId: 'g1:p1', before: { groupId: 'g1', productId: 'p1', price: 12 }, after: { groupId: 'g1', productId: 'p1', price: null } },
    ])
  })

  it('preserves both concurrent individual-price changes', async () => {
    harness.state.data = { groups: [group()], overrides: [] }

    await Promise.all([
      setOverride('g1', 'p1', 10, audit),
      setOverride('g1', 'p2', 20, audit),
    ])

    expect(harness.state.data.overrides).toEqual(expect.arrayContaining([
      { groupId: 'g1', productId: 'p1', price: 10 },
      { groupId: 'g1', productId: 'p2', price: 20 },
    ]))
    expect(harness.state.audits).toHaveLength(2)
  })

  it('rolls back a group mutation when audit append fails', async () => {
    harness.state.data = { groups: [group()], overrides: [] }
    harness.failAudit = true

    const result = await updatePriceGroup('g1', {
      name: 'VIP', description: 'Description', multiplier: 0.9, color: '#112233',
    }, audit)

    expect(result).toEqual({ success: false, error: 'write_failed' })
    expect(harness.state.data.groups[0].name).toBe('Group g1')
    expect(harness.state.audits).toEqual([])
  })

  it('rolls back an individual price when audit append fails', async () => {
    harness.state.data = { groups: [group()], overrides: [] }
    harness.failAudit = true

    const result = await setOverride('g1', 'p1', 10, audit)

    expect(result).toEqual({ success: false, error: 'write_failed' })
    expect(harness.state.data.overrides).toEqual([])
    expect(harness.state.audits).toEqual([])
  })
})
