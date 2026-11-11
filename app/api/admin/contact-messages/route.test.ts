import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  setContactMessageAnswered: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: h.requireAdminPermission }))
vi.mock('@/lib/contact-message-status', () => ({ setContactMessageAnswered: h.setContactMessageAnswered }))

import { PATCH } from './route'

const ACTOR = { id: 'manager-1', email: 'manager@test.com', teamRole: 'manager' }

function patch(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/contact-messages', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.requireAdminPermission.mockResolvedValue(ACTOR)
  h.setContactMessageAnswered.mockResolvedValue('changed')
})

describe('PATCH /api/admin/contact-messages', () => {
  it('requires customers.read before any change', async () => {
    h.requireAdminPermission.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await PATCH(patch({ id: 'm1', answered: true }))).status).toBe(403)
    expect(h.requireAdminPermission).toHaveBeenCalledWith('customers.read')
    expect(h.setContactMessageAnswered).not.toHaveBeenCalled()
  })

  it.each([[{}], [{ id: '   ' }], [{ id: 42 }]])('answers 400 id_required for %j', async (body) => {
    const res = await PATCH(patch(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'id_required' })
    expect(h.setContactMessageAnswered).not.toHaveBeenCalled()
  })

  it('keeps the 500 contract for malformed JSON', async () => {
    const res = await PATCH(patch('{'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server_error' })
  })

  it('passes the session actor and request, and keeps the response shape', async () => {
    const request = patch({ id: ' m1 ', answered: false })
    const res = await PATCH(request)
    expect(await res.json()).toEqual({ id: 'm1', answered: false })
    expect(h.setContactMessageAnswered).toHaveBeenCalledWith('m1', false, { actor: ACTOR, request })
  })

  it('treats anything but answered=false as answered, as before', async () => {
    await PATCH(patch({ id: 'm1' }))
    expect(h.setContactMessageAnswered).toHaveBeenCalledWith('m1', true, expect.anything())
  })

  it('answers a repeated status with the same success body', async () => {
    h.setContactMessageAnswered.mockResolvedValue('unchanged')
    expect(await (await PATCH(patch({ id: 'm1', answered: true }))).json()).toEqual({ id: 'm1', answered: true })
  })

  it('keeps 404 for a missing message', async () => {
    h.setContactMessageAnswered.mockResolvedValue('not_found')
    const res = await PATCH(patch({ id: 'nope', answered: true }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'message_not_found' })
  })

  it('answers 500 when the transition or its audit fails', async () => {
    h.setContactMessageAnswered.mockRejectedValue(new Error('audit unavailable'))
    expect((await PATCH(patch({ id: 'm1', answered: true }))).status).toBe(500)
  })
})
