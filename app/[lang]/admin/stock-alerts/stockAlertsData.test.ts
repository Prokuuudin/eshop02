import { describe, expect, it, vi } from 'vitest'
import {
    deriveStockAlertRows,
    fetchStockAlertProducts,
    fetchSyncedProductIds,
    type Product,
} from './stockAlertsData'

function makeProduct(overrides: Partial<Product> = {}): Product {
    return {
        id: 'p1',
        title: 'Shampoo',
        brand: 'Brand',
        category: 'hair',
        stock: 10000,
        price: 12,
        ...overrides,
    }
}

describe('deriveStockAlertRows', () => {
    it('marks a product with placeholder stock (no ERP externalId) as not synced', () => {
        const placeholder = makeProduct({ id: 'p1', stock: 10000 })
        const real = makeProduct({ id: 'p2', stock: 3 })

        const rows = deriveStockAlertRows([placeholder, real], new Set(['p2']))

        expect(rows).toEqual([
            { ...placeholder, synced: false },
            { ...real, synced: true },
        ])
    })

    it('is driven purely by the synced-id set, independent of the stock number', () => {
        // A product can carry the 10000 placeholder value AND be ERP-synced (e.g. the
        // ERP itself reported 10000 units), and a non-synced product can have any other
        // stock number left over from import — the sync flag never depends on `stock`.
        const syncedButAtPlaceholderValue = makeProduct({ id: 'p3', stock: 10000 })
        const unsyncedWithLowStock = makeProduct({ id: 'p4', stock: 2 })

        const rows = deriveStockAlertRows(
            [syncedButAtPlaceholderValue, unsyncedWithLowStock],
            new Set(['p3'])
        )

        expect(rows.find((r) => r.id === 'p3')).toMatchObject({ stock: 10000, synced: true })
        expect(rows.find((r) => r.id === 'p4')).toMatchObject({ stock: 2, synced: false })
    })

    it('returns an empty array for an empty product list', () => {
        expect(deriveStockAlertRows([], new Set(['anything']))).toEqual([])
    })
})

describe('fetchStockAlertProducts', () => {
    it('unwraps the { data: { products } } envelope returned by /api/admin/products', async () => {
        const product = makeProduct()
        const fetchMock = vi.fn().mockResolvedValue({
            json: async () => ({ success: true, data: { products: [product] }, timestamp: 'x' }),
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await fetchStockAlertProducts()

        expect(fetchMock).toHaveBeenCalledWith('/api/admin/products')
        expect(result).toEqual([product])
    })

    it('returns an empty array when the response has no products (defensive)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}) }))
        expect(await fetchStockAlertProducts()).toEqual([])
    })
})

describe('fetchSyncedProductIds', () => {
    it('builds a Set from the syncedIds array returned by the sync-status endpoint', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ syncedIds: ['p2', 'p3'] }) })
        vi.stubGlobal('fetch', fetchMock)

        const result = await fetchSyncedProductIds()

        expect(fetchMock).toHaveBeenCalledWith('/api/admin/products/sync-status')
        expect(result).toEqual(new Set(['p2', 'p3']))
    })

    it('returns an empty Set when the response has no syncedIds (defensive)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}) }))
        expect(await fetchSyncedProductIds()).toEqual(new Set())
    })
})
