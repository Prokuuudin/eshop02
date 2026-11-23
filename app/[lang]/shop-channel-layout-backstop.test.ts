import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Server-side backstop for paths proxy.ts's page matcher skips (a segment with a dot):
// the admin and RFQ layouts must refuse to render in a B2C deployment on their own.
const { notFound, redirect, getServerUser, getAdminAccessLevel } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
  getServerUser: vi.fn(async () => ({ id: 'admin-1' })),
  getAdminAccessLevel: vi.fn(() => 'admin'),
}))

vi.mock('next/navigation', () => ({ notFound, redirect }))
vi.mock('@/lib/server-auth', () => ({ getServerUser, getAdminAccessLevel, hasAdminUsersInDb: vi.fn(async () => true) }))
for (const component of ['AdminGate', 'AdminPermissionGate', 'AdminOperationalDataSync', 'AdminErrorCenter', 'AdminConfirmProvider', 'AdminPageNavigation', 'AdminDisclosureAutoScroll']) {
  vi.doMock(`@/components/admin/${component}`, () => ({ default: () => null }))
}

describe('B2B-only layouts', () => {
  beforeEach(() => {
    notFound.mockClear()
    getServerUser.mockClear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('admin layout is not found in a B2C deployment, before any session lookup', async () => {
    vi.stubEnv('SHOP_CHANNEL', 'b2c')
    const { default: AdminLayout } = await import('./admin/layout')
    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getServerUser).not.toHaveBeenCalled()
  })

  it.each([undefined, 'b2b'])('admin layout renders as before with SHOP_CHANNEL=%j', async (value) => {
    if (value !== undefined) vi.stubEnv('SHOP_CHANNEL', value)
    const { default: AdminLayout } = await import('./admin/layout')
    await expect(AdminLayout({ children: null })).resolves.toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
    expect(getServerUser).toHaveBeenCalledOnce()
  })

  it('request-quote layout is not found in a B2C deployment and unchanged in B2B', async () => {
    const { default: RequestQuoteLayout } = await import('./request-quote/layout')
    const props = { children: 'rfq', params: Promise.resolve({ lang: 'lv' }) }
    expect(RequestQuoteLayout(props)).toBe('rfq')
    vi.stubEnv('SHOP_CHANNEL', 'b2c')
    expect(() => RequestQuoteLayout(props)).toThrow('NEXT_NOT_FOUND')
  })
})
