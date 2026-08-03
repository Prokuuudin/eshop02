import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminHttpError, adminFetchJson, classifyAdminError } from './admin-ui-errors'

afterEach(() => vi.unstubAllGlobals())

describe('admin UI error handling', () => {
  it.each([
    [403, 'forbidden'], [400, 'validation'], [409, 'validation'], [500, 'server'], [503, 'server'],
  ] as const)('classifies HTTP %s as %s', (status, kind) => {
    expect(classifyAdminError(new AdminHttpError(status, 'failed')).kind).toBe(kind)
  })

  it('classifies failed connections as network errors', () => {
    expect(classifyAdminError(new TypeError('fetch failed')).kind).toBe('network')
  })

  it('preserves server validation details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_sku' }), { status: 422 })))
    await expect(adminFetchJson('/api/admin/products')).rejects.toMatchObject({ status: 422, message: 'invalid_sku' })
  })

  it('returns parsed successful data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 })))
    await expect(adminFetchJson<{ items: unknown[] }>('/api/admin/test')).resolves.toEqual({ items: [] })
  })
})
