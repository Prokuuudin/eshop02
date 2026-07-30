import { describe, expect, it, vi, beforeEach } from 'vitest'

const findUniqueMock = vi.hoisted(() => vi.fn())
const upsertMock = vi.hoisted(() => vi.fn().mockResolvedValue({}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
    },
  },
}))

import { checksumOf, saveSnapshot, getSnapshotHistory, getSnapshotContent } from './xml-snapshot-store'

beforeEach(() => {
  vi.clearAllMocks()
  findUniqueMock.mockResolvedValue(null)
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

  it('rotates to the next slot on each subsequent call, wrapping after 3', async () => {
    findUniqueMock.mockResolvedValueOnce({
      value: { nextSlot: 1, entries: [{ slot: 0, checksum: 'x', sizeBytes: 1, downloadedAt: 'a' }] },
    })
    const meta = await saveSnapshot('<root>second</root>')
    expect(meta.slot).toBe(1)
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
