import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: mocks.auth }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: mocks.audit }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: async (callback: (tx: unknown) => unknown) => callback({ order: { findUnique: mocks.find, update: mocks.update } }) } }))
import { PUT } from './route'
const body = { orderId: '1001', shipmentCarrier: 'omniva', trackingNumber: 'ABC123', trackingUrl: 'https://example.com/track', labelUrl: '' }
const request = (payload = body) => new NextRequest('http://localhost/api/admin/orders/shipment', { method: 'PUT', body: JSON.stringify(payload) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'admin' })
  mocks.find.mockResolvedValue({ id: '1001', trackingNumber: null })
  mocks.update.mockResolvedValue({ id: '1001' })
})
it('requires order update permission before writing', async () => {
  mocks.auth.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
  expect((await PUT(request())).status).toBe(403)
  expect(mocks.auth).toHaveBeenCalledWith('orders.update')
  expect(mocks.update).not.toHaveBeenCalled()
})
it('rejects unsafe tracking links', async () => {
  expect((await PUT(request({ ...body, trackingUrl: 'javascript:alert(1)' }))).status).toBe(400)
  expect(mocks.update).not.toHaveBeenCalled()
})
it('saves tracking with an audit and leaves fulfilment status unchanged', async () => {
  expect((await PUT(request())).status).toBe(200)
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: '1001' }, data: { shipmentCarrier: 'omniva', trackingNumber: 'ABC123', trackingUrl: body.trackingUrl, labelUrl: null } })
  expect(mocks.audit).toHaveBeenCalled()
})
it('returns 404 for a missing order', async () => {
  mocks.find.mockResolvedValue(null)
  expect((await PUT(request())).status).toBe(404)
  expect(mocks.update).not.toHaveBeenCalled()
})
