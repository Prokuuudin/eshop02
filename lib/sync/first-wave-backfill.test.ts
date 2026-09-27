import {
  applyFirstWaveAtomic, assertImmutableAllowlist, requireAllowlistForApply, sha256, validateFirstWave,
  type AtomicStore, type CurrentProduct, type FirstWaveAllowlist, type FirstWaveEntry, type ValidationPolicy,
} from './first-wave-backfill'

const xml = '<root><item><sku>ABC</sku></item><item><sku>00123</sku></item></root>'
const policy: ValidationPolicy = { xmlSha256: sha256(xml), total: 2, exact: 1, leadingZero: 1 }
const entries: FirstWaveEntry[] = [
  { productId: 'p1', productSku: 'ABC', xmlSku: 'ABC', externalIdToSet: 'ABC', matchType: 'EXACT_SAFE' },
  { productId: 'p2', productSku: '00123', xmlSku: '00123', externalIdToSet: '00123', matchType: 'LEADING_ZERO_EXACT_SAFE' },
]
const allowlist = (): FirstWaveAllowlist => ({ schemaVersion: 1, xmlSha256: sha256(xml), catalogFingerprint: 'fp', entries: structuredClone(entries) })
const products = (): CurrentProduct[] => entries.map(entry => ({ id: entry.productId, sku: entry.productSku, externalId: null, isDeleted: false }))

function mockStore(initial = products(), failAfterMutation = false) {
  const state = new Map(initial.map(product => [product.id, { ...product, price: 10, stock: 7, isActive: true, title: product.id }]))
  let writes = 0
  const store: AtomicStore = {
    transaction: async operation => {
      const draft = new Map([...state].map(([id, product]) => [id, { ...product }]))
      try {
        const result = await operation({
          getProducts: async ids => ids.flatMap(id => { const p = draft.get(id); return p ? [{ id: p.id, sku: p.sku, externalId: p.externalId, isDeleted: p.isDeleted }] : [] }),
          updateExternalIds: async updateEntries => {
            let updated = 0
            for (const entry of updateEntries) {
              const p = draft.get(entry.productId)
              if (p && p.sku === entry.productSku && p.externalId === null && !p.isDeleted) { p.externalId = entry.externalIdToSet; updated++; writes++ }
            }
            if (failAfterMutation) throw new Error('simulated failure')
            return updated
          },
        })
        state.clear(); for (const [id, product] of draft) state.set(id, product)
        return result
      } catch (error) { writes = 0; throw error }
    },
  }
  return { store, state, writes: () => writes }
}

describe('first-wave externalId backfill', () => {
  it('dry-run validation performs no writes', () => {
    const original = structuredClone(products())
    expect(validateFirstWave(allowlist(), xml, products(), new Set(), policy)).toEqual({ exact: 1, leadingZero: 1 })
    expect(products()).toEqual(original)
  })

  it('requires an explicit allowlist for apply', () => {
    expect(() => requireAllowlistForApply(true)).toThrow('--apply requires --allowlist')
    expect(() => requireAllowlistForApply(false)).not.toThrow()
  })

  it('rejects an allowlist whose immutable file hash changed', () => {
    expect(() => assertImmutableAllowlist(JSON.stringify(allowlist()))).toThrow('Allowlist SHA-256 mismatch')
  })

  it('rejects a wrong XML SHA-256', () => {
    expect(() => validateFirstWave(allowlist(), xml + ' ', products(), new Set(), policy)).toThrow('XML SHA-256 mismatch')
  })

  it('rejects a changed Product SKU', () => {
    const rows = products(); rows[0].sku = 'CHANGED'
    expect(() => validateFirstWave(allowlist(), xml, rows, new Set(), policy)).toThrow('current SKU mismatch')
  })

  it('rejects an already populated externalId', () => {
    const rows = products(); rows[0].externalId = 'EXISTING'
    expect(() => validateFirstWave(allowlist(), xml, rows, new Set(), policy)).toThrow('externalId already set')
  })

  it('rejects a missing Product', () => {
    expect(() => validateFirstWave(allowlist(), xml, products().slice(1), new Set(), policy)).toThrow('missing Product p1')
  })

  it('rejects duplicate productId', () => {
    const list = allowlist(); list.entries[1].productId = 'p1'
    expect(() => validateFirstWave(list, xml, products(), new Set(), policy)).toThrow('duplicate productId')
  })

  it('rejects duplicate externalIdToSet', () => {
    const list = allowlist(); list.entries[1].externalIdToSet = 'ABC'
    expect(() => validateFirstWave(list, xml, products(), new Set(), policy)).toThrow('duplicate externalIdToSet')
  })

  it('does not change Product outside the allowlist', async () => {
    const outside = { id: 'outside', sku: 'OUT', externalId: null, isDeleted: false }
    const { store, state } = mockStore([...products(), outside])
    await applyFirstWaveAtomic(store, allowlist(), xml, new Set(), policy)
    expect(state.get('outside')?.externalId).toBeNull()
  })

  it('rejects case-only matching and excluded REVIEW products', () => {
    const list = allowlist(); list.entries[0].productSku = 'abc'
    expect(() => validateFirstWave(list, xml, [{ ...products()[0], sku: 'abc' }, products()[1]], new Set(), policy)).toThrow('non-exact SKU mapping')
    expect(() => validateFirstWave(allowlist(), xml, products(), new Set(['p1']), policy)).toThrow('excluded REVIEW Product')
  })

  it('preserves a leading-zero SKU as an opaque exact string', async () => {
    const { store, state } = mockStore()
    await applyFirstWaveAtomic(store, allowlist(), xml, new Set(), policy)
    expect(state.get('p2')?.externalId).toBe('00123')
  })

  it('rolls back the entire transaction when one operation fails', async () => {
    const { store, state, writes } = mockStore(products(), true)
    await expect(applyFirstWaveAtomic(store, allowlist(), xml, new Set(), policy)).rejects.toThrow('simulated failure')
    expect(writes()).toBe(0)
    expect([...state.values()].every(product => product.externalId === null)).toBe(true)
  })

  it('changes only externalId for allowlisted Products', async () => {
    const { store, state } = mockStore()
    const before = structuredClone([...state.values()])
    await applyFirstWaveAtomic(store, allowlist(), xml, new Set(), policy)
    const after = [...state.values()]
    for (let index = 0; index < before.length; index++) {
      expect({ ...after[index], externalId: null }).toEqual(before[index])
      expect(after[index].externalId).toBe(entries[index].externalIdToSet)
    }
  })
})
