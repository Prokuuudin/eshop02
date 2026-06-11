import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    userNotification: { createMany: vi.fn() },
  },
}))

import { getServerUser } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/notifications/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/admin/notifications/send', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await POST(makeRequest({ userIds: ['u1'], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when caller is not admin', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', platformRole: 'customer' } as any)
    const res = await POST(makeRequest({ userIds: ['u2'], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when userIds is empty', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    const res = await POST(makeRequest({ userIds: [], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    const res = await POST(makeRequest({ userIds: ['u1'], message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    const res = await POST(makeRequest({ userIds: ['u1'], title: 'T', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('creates app notifications without sending email for channel=app', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 2 })
    const res = await POST(makeRequest({
      userIds: ['u1', 'u2'],
      title: 'Flash sale',
      message: 'Use code SAVE10',
      type: 'promo',
      channel: 'app',
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.created).toBe(2)
    expect(json.emailsSent).toBe(0)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.userNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'u1', title: 'Flash sale', channel: 'app' }),
        expect.objectContaining({ userId: 'u2', title: 'Flash sale', channel: 'app' }),
      ]),
    })
  })

  it('sends emails for channel=email', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.user.findMany as any).mockResolvedValue([
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'bob@example.com' },
    ])
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 2 })
    vi.mocked(sendEmail as any).mockResolvedValue(undefined)
    const res = await POST(makeRequest({
      userIds: ['u1', 'u2'],
      title: 'Sale',
      message: 'Big discounts',
      type: 'success',
      channel: 'email',
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emailsSent).toBe(2)
    expect(json.emailsFailed).toBe(0)
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it('counts failed emails separately, still returns 200', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.user.findMany as any).mockResolvedValue([{ id: 'u1', email: 'bad@bad.bad' }])
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 1 })
    vi.mocked(sendEmail as any).mockRejectedValue(new Error('smtp error'))
    const res = await POST(makeRequest({
      userIds: ['u1'],
      title: 'T',
      message: 'M',
      type: 'info',
      channel: 'email',
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emailsSent).toBe(0)
    expect(json.emailsFailed).toBe(1)
    expect(json.created).toBe(1)
  })

  it('rejects javascript: links', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 1 })
    const res = await POST(makeRequest({
      userIds: ['u1'],
      title: 'T',
      message: 'M',
      type: 'info',
      channel: 'app',
      link: 'javascript:alert(1)',
    }))
    expect(res.status).toBe(200)
    expect(prisma.userNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ link: null })]),
    })
  })

  it('creates notifications and sends emails for channel=both', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.user.findMany as any).mockResolvedValue([
      { id: 'u1', email: 'alice@example.com' },
    ])
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 1 })
    vi.mocked(sendEmail as any).mockResolvedValue(undefined)
    const res = await POST(makeRequest({
      userIds: ['u1'],
      title: 'T',
      message: 'M',
      type: 'info',
      channel: 'both',
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.created).toBe(1)
    expect(json.emailsSent).toBe(1)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(prisma.userNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ userId: 'u1', channel: 'both' })]),
    })
  })

  it('filters empty strings from userIds', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 2 })
    const res = await POST(makeRequest({
      userIds: ['u1', '', 'u2'],
      title: 'T',
      message: 'M',
      type: 'info',
      channel: 'app',
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.created).toBe(2)
    expect(prisma.userNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'u1' }),
        expect.objectContaining({ userId: 'u2' }),
      ]),
    })
  })
})
