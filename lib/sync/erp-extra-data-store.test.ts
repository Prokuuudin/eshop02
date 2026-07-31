import { describe, expect, it, vi } from 'vitest'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import { getErpExtraData, getErpExtraDataFor, replaceErpExtraData, type ErpExtraData } from './erp-extra-data-store'

function makeMockDb(storedValue: unknown = undefined) {
  return {
    keyValueSetting: {
      findUnique: vi.fn().mockResolvedValue(storedValue === undefined ? null : { key: 'erp-extra-data', value: storedValue }),
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as unknown as ExtendedPrismaClient
}

const sample: Record<string, ErpExtraData> = {
  '6580075': {
    prices: { price1: 9, price2: 7, price3: 2.44, price4: 5 },
    warehouseQuantities: { '10000': 22, '10001': 4 },
  },
}

describe('getErpExtraData', () => {
  it('returns an empty object when nothing stored yet', async () => {
    const db = makeMockDb(undefined)
    expect(await getErpExtraData(db)).toEqual({})
  })

  it('returns the stored map', async () => {
    const db = makeMockDb(sample)
    expect(await getErpExtraData(db)).toEqual(sample)
  })
})

describe('getErpExtraDataFor', () => {
  it('returns the entry for a known externalId', async () => {
    const db = makeMockDb(sample)
    expect(await getErpExtraDataFor(db, '6580075')).toEqual(sample['6580075'])
  })

  it('returns undefined for an unknown externalId', async () => {
    const db = makeMockDb(sample)
    expect(await getErpExtraDataFor(db, 'nope')).toBeUndefined()
  })
})

describe('replaceErpExtraData', () => {
  it('upserts the whole map under a single fixed key', async () => {
    const db = makeMockDb(undefined)
    await replaceErpExtraData(db, sample)
    expect(db.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'erp-extra-data' },
        create: expect.objectContaining({ key: 'erp-extra-data', value: sample }),
        update: expect.objectContaining({ value: sample }),
      }),
    )
  })
})
