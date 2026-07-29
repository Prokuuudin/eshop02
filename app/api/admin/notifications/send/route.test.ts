import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

const {
  getServerUserMock,
  sendEmailMock,
  userFindManyMock,
  notificationCreateManyMock,
} = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
  sendEmailMock: vi.fn(),
  userFindManyMock: vi.fn(),
  notificationCreateManyMock: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/mailer', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: userFindManyMock },
    userNotification: { createMany: notificationCreateManyMock },
  },
}))

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
    getServerUserMock.mockResolvedValue(null)
    const res = await POST(makeRequest({ userIds: ['u1'], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when caller is not admin', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', platformRole: 'customer' })
    const res = await POST(makeRequest({ userIds: ['u2'], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when userIds is empty', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    const res = await POST(makeRequest({ userIds: [], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is missing', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    const res = await POST(makeRequest({ userIds: ['u1'], message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is missing', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    const res = await POST(makeRequest({ userIds: ['u1'], title: 'T', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('creates app notifications without sending email for channel=app', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    notificationCreateManyMock.mockResolvedValue({ count: 2 })
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
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(notificationCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'u1', title: 'Flash sale', channel: 'app' }),
        expect.objectContaining({ userId: 'u2', title: 'Flash sale', channel: 'app' }),
      ]),
    })
  })

  it('sends emails for channel=email', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    userFindManyMock.mockResolvedValue([
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'bob@example.com' },
    ])
    notificationCreateManyMock.mockResolvedValue({ count: 2 })
    sendEmailMock.mockResolvedValue(undefined)
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
    expect(sendEmailMock).toHaveBeenCalledTimes(2)
  })

  it('counts failed emails separately, still returns 200', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    userFindManyMock.mockResolvedValue([{ id: 'u1', email: 'bad@bad.bad' }])
    notificationCreateManyMock.mockResolvedValue({ count: 1 })
    sendEmailMock.mockRejectedValue(new Error('smtp error'))
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
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    notificationCreateManyMock.mockResolvedValue({ count: 1 })
    const res = await POST(makeRequest({
      userIds: ['u1'],
      title: 'T',
      message: 'M',
      type: 'info',
      channel: 'app',
      link: 'javascript:alert(1)',
    }))
    expect(res.status).toBe(200)
    expect(notificationCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ link: null })]),
    })
  })

  it('creates notifications and sends emails for channel=both', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    userFindManyMock.mockResolvedValue([
      { id: 'u1', email: 'alice@example.com' },
    ])
    notificationCreateManyMock.mockResolvedValue({ count: 1 })
    sendEmailMock.mockResolvedValue(undefined)
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
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(notificationCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ userId: 'u1', channel: 'both' })]),
    })
  })

  it('filters empty strings from userIds', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    notificationCreateManyMock.mockResolvedValue({ count: 2 })
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
    expect(notificationCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'u1' }),
        expect.objectContaining({ userId: 'u2' }),
      ]),
    })
  })
})
