import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getServerUserMock = vi.hoisted(() => vi.fn())
const findUniqueMock = vi.hoisted(() => vi.fn())
const updateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: findUniqueMock, update: updateMock } },
}))

import { GET, PATCH } from './route'

describe('/api/notifications/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerUserMock.mockResolvedValue({ id: 'u1' })
  })

  it('reads the server-side channel', async () => {
    findUniqueMock.mockResolvedValue({ notificationChannel: 'both' })
    const response = await GET()
    expect(await response.json()).toEqual({ channel: 'both' })
  })

  it('defaults an invalid legacy value to app', async () => {
    findUniqueMock.mockResolvedValue({ notificationChannel: 'legacy' })
    const response = await GET()
    expect(await response.json()).toEqual({ channel: 'app' })
  })

  it('persists a valid channel for the authenticated user', async () => {
    const request = new NextRequest('http://localhost/api/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'email' }),
    })
    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'u1' }, data: { notificationChannel: 'email' },
    })
  })

  it('rejects an invalid channel', async () => {
    const request = new NextRequest('http://localhost/api/notifications/preferences', {
      method: 'PATCH', body: JSON.stringify({ channel: 'sms' }),
    })
    const response = await PATCH(request)
    expect(response.status).toBe(400)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('requires authentication', async () => {
    getServerUserMock.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })
})
