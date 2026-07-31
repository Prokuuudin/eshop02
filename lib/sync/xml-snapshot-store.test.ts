import { describe, expect, it, vi, beforeEach } from 'vitest'

const findUniqueMock = vi.hoisted(() => vi.fn())
const upsertMock = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const transactionMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
    },
    $transaction: transactionMock,
  },
}))

import { checksumOf, saveSnapshot, getSnapshotHistory, getSnapshotContent, type SnapshotMeta } from './xml-snapshot-store'

beforeEach(() => {
  vi.clearAllMocks()
  findUniqueMock.mockResolvedValue(null)
  transactionMock.mockImplementation(async (_ops) => {
    // Execute the upserts in the transaction and return empty array
    return []
  })
})

describe('checksumOf', () => {
  it('is deterministic and content-sensitive', () => {
    expect(checksumOf('abc')).toBe(checksumOf('abc'))
    expect(checksumOf('abc')).not.toBe(checksumOf('abd'))
  })
})

describe('getSnapshotHistory', () => {
  it('returns an empty array when nothing stored yet', async () => {
    expect(await getSnapshotHistory()).toEqual([])
  })
})

describe('saveSnapshot', () => {
  it('writes the raw content to slot 0 on the first call', async () => {
    findUniqueMock.mockResolvedValueOnce(null) // index row: nothing yet
    const meta = await saveSnapshot('<root>first</root>')
    expect(meta.slot).toBe(0)
    expect(meta.checksum).toBe(checksumOf('<root>first</root>'))
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'erp-xml-snapshot-content:0' } }),
    )
  })

  it('rotates to the next slot on each subsequent call, wrapping after 3, and deduplicates/caps at MAX_SNAPSHOTS', async () => {
    // Simulate 4 sequential saveSnapshot calls with a stateful mock that tracks the index state
    const indexState: { nextSlot: number; entries: SnapshotMeta[] } = { nextSlot: 0, entries: [] }

    findUniqueMock.mockImplementation(async ({ where: { key } }) => {
      if (key === 'erp-xml-snapshot-index') {
        return { value: indexState }
      }
      return null
    })

    transactionMock.mockImplementation(async (promises) => {
      // The promises array contains upsert calls. We track the last index upsert.
      const results = []
      let lastIndexUpsert = null

      for (const promise of promises) {
        // Each item is a Prisma promise, we need to resolve it
        const result = await Promise.resolve(promise)
        results.push(result)
      }

      // Check the upsert calls that just happened (the last 2 calls should be content + index)
      const recentCalls = upsertMock.mock.calls.slice(-2)
      for (const call of recentCalls) {
        if (call[0]?.where?.key === 'erp-xml-snapshot-index') {
          lastIndexUpsert = call[0]
        }
      }

      if (lastIndexUpsert) {
        const newValue = lastIndexUpsert.update?.value || lastIndexUpsert.create?.value
        if (newValue) {
          Object.assign(indexState, newValue)
        }
      }

      return results
    })

    // Call 1: slot 0
    const meta1 = await saveSnapshot('<root>first</root>')
    expect(meta1.slot).toBe(0)

    // Call 2: slot 1
    const meta2 = await saveSnapshot('<root>second</root>')
    expect(meta2.slot).toBe(1)

    // Call 3: slot 2
    const meta3 = await saveSnapshot('<root>third</root>')
    expect(meta3.slot).toBe(2)

    // Call 4: wraps back to slot 0, and caps entries to 3
    const meta4 = await saveSnapshot('<root>fourth</root>')
    expect(meta4.slot).toBe(0)

    // After 4 saves, the index should have:
    // - nextSlot: 1 (because we just wrapped to 0 and will increment to 1)
    // - entries: [meta4, meta3, meta2] (most recent first, slot 0 deduped/replaced)
    expect(indexState.nextSlot).toBe(1)
    expect(indexState.entries).toHaveLength(3)
    expect(indexState.entries[0].slot).toBe(0) // most recent
    expect(indexState.entries[1].slot).toBe(2)
    expect(indexState.entries[2].slot).toBe(1)
  })

  it('dedupes byte-identical content: a second call with the same xml does not rotate the slot or write again', async () => {
    // Same stateful mock pattern as the rotation test above, so a real "second write"
    // would be observable via indexState/transactionMock changes.
    const indexState: { nextSlot: number; entries: SnapshotMeta[] } = { nextSlot: 0, entries: [] }

    findUniqueMock.mockImplementation(async ({ where: { key } }) => {
      if (key === 'erp-xml-snapshot-index') {
        const hasData = indexState.entries.length > 0 || indexState.nextSlot !== 0
        return hasData ? { value: indexState } : null
      }
      return null
    })

    transactionMock.mockImplementation(async (promises) => {
      const results = []
      for (const promise of promises) {
        results.push(await Promise.resolve(promise))
      }

      const recentCalls = upsertMock.mock.calls.slice(-2)
      for (const call of recentCalls) {
        if (call[0]?.where?.key === 'erp-xml-snapshot-index') {
          const newValue = call[0].update?.value || call[0].create?.value
          if (newValue) Object.assign(indexState, newValue)
        }
      }

      return results
    })

    const xml = '<root>identical payload retried after a truncated download</root>'

    const meta1 = await saveSnapshot(xml)
    expect(meta1.slot).toBe(0)
    expect(indexState.nextSlot).toBe(1)
    expect(indexState.entries).toHaveLength(1)

    const meta2 = await saveSnapshot(xml)

    // No rotation, no second write: same slot/checksum metadata returned, and the
    // transaction (the only place an actual write happens) fired exactly once total.
    expect(meta2).toEqual(meta1)
    expect(indexState.nextSlot).toBe(1)
    expect(indexState.entries).toHaveLength(1)
    expect(transactionMock).toHaveBeenCalledTimes(1)
  })
})

describe('getSnapshotContent', () => {
  it('returns undefined when the slot has nothing stored', async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    expect(await getSnapshotContent(0)).toBeUndefined()
  })

  it('returns the stored xml text for a populated slot', async () => {
    findUniqueMock.mockResolvedValueOnce({ value: { xml: '<root>stored</root>' } })
    expect(await getSnapshotContent(0)).toBe('<root>stored</root>')
  })
})
