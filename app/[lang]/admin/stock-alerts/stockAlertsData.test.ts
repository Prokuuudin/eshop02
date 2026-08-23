import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchStockAlerts, type StockAlertsResponse } from './stockAlertsData'

afterEach(() => vi.unstubAllGlobals())

describe('fetchStockAlerts', () => {
    it('sends pagination and filters to the dedicated endpoint', async () => {
        const response: StockAlertsResponse = {
            products: [], total: 0, productCount: 10, outCount: 2, lowCount: 3,
            unconfirmedCount: 4, page: 2, limit: 50, totalPages: 1,
        }
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
        vi.stubGlobal('fetch', fetchMock)

        const result = await fetchStockAlerts({
            page: 2, limit: 50, threshold: 7, search: 'shampoo',
            filter: 'low', hideUnconfirmed: true,
        })

        const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toContain('/api/admin/stock-alerts?')
        expect(url).toContain('page=2')
        expect(url).toContain('limit=50')
        expect(url).toContain('threshold=7')
        expect(url).toContain('q=shampoo')
        expect(url).toContain('filter=low')
        expect(url).toContain('hideUnconfirmed=true')
        expect(result).toEqual(response)
    })

    it('throws when the endpoint returns an error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
        await expect(fetchStockAlerts({
            page: 1, limit: 50, threshold: 5, search: '', filter: 'all', hideUnconfirmed: false,
        })).rejects.toThrow('Stock alerts request failed: 500')
    })
})
