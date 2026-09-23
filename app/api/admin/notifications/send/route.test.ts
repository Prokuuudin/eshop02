import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

const {
  getServerUserMock,
  sendEmailMock,
  userFindManyMock,
  mediaFindManyMock,
  notificationCreateManyMock,
} = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
  sendEmailMock: vi.fn(),
  userFindManyMock: vi.fn(),
  mediaFindManyMock: vi.fn(),
  notificationCreateManyMock: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: getServerUserMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: userFindManyMock },
    mediaAsset: { findMany: mediaFindManyMock },
    userNotification: { createMany: notificationCreateManyMock },
    $transaction: vi.fn((callback: (client: unknown) => unknown) => callback({
      userNotification: { createMany: notificationCreateManyMock },
    })),
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
  beforeEach(() => {
    vi.clearAllMocks()
    userFindManyMock.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ({ id, email: `${id}@example.com`, notificationsSubscribed: true, marketingConsent: true }))))
  })

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

  it('returns 400 when userIds exceeds the recipient cap', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    const userIds = Array.from({ length: 501 }, (_, i) => `u${i}`)
    const res = await POST(makeRequest({ userIds, title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('too_many_recipients')
    expect(notificationCreateManyMock).not.toHaveBeenCalled()
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
    expect(json.appDelivered).toBe(2)
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
      { id: 'u1', email: 'alice@example.com', notificationsSubscribed: true, marketingConsent: true },
      { id: 'u2', email: 'bob@example.com', notificationsSubscribed: true, marketingConsent: true },
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
    userFindManyMock.mockResolvedValue([{ id: 'u1', email: 'bad@bad.bad', notificationsSubscribed: true, marketingConsent: true }])
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
    expect(json.selected).toBe(1)
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
    expect(res.status).toBe(400)
    expect(notificationCreateManyMock).not.toHaveBeenCalled()
  })

  it('creates notifications and sends emails for channel=both', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    userFindManyMock.mockResolvedValue([
      { id: 'u1', email: 'alice@example.com', notificationsSubscribed: true, marketingConsent: true },
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
    expect(json.appDelivered).toBe(1)
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
    expect(json.appDelivered).toBe(2)
    expect(notificationCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'u1' }),
        expect.objectContaining({ userId: 'u2' }),
      ]),
    })
  })

  it('honours unsubscribe on the server', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    userFindManyMock.mockResolvedValue([{ id: 'u1', email: 'u1@example.com', notificationsSubscribed: false, marketingConsent: true }])
    const res = await POST(makeRequest({ userIds: ['u1'], title: 'T', message: 'M', type: 'info', channel: 'both' }))
    expect(await res.json()).toMatchObject({ preferencesSkipped: 1, appDelivered: 0, emailsSent: 0 })
    expect(notificationCreateManyMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('does not deliver promo without marketing consent', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    userFindManyMock.mockResolvedValue([{ id: 'u1', email: 'u1@example.com', notificationsSubscribed: true, marketingConsent: false }])
    const res = await POST(makeRequest({ userIds: ['u1'], title: 'T', message: 'M', type: 'promo', channel: 'both' }))
    expect(await res.json()).toMatchObject({ marketingConsentSkipped: 1, appDelivered: 0, emailsSent: 0 })
  })

  it.each(['https://evil.test', '//evil.test', 'javascript:alert(1)'])('rejects unsafe link %s', async (link) => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    expect((await POST(makeRequest({ userIds: ['u1'], title: 'T', message: 'M', type: 'info', channel: 'app', link }))).status).toBe(400)
  })

  it('rejects title and message above their limits', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    expect((await POST(makeRequest({ userIds: ['u1'], title: 'x'.repeat(151), message: 'M' }))).status).toBe(400)
    expect((await POST(makeRequest({ userIds: ['u1'], title: 'T', message: 'x'.repeat(5001) }))).status).toBe(400)
  })

  it('adds a verified image to app delivery and files to email attachments', async () => {
    getServerUserMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' })
    mediaFindManyMock.mockResolvedValue([
      { name: 'greeting.png', mimeType: 'image/png', size: 8, data: new Uint8Array([1]) },
      { name: 'offer.pdf', mimeType: 'application/pdf', size: 10, data: new Uint8Array([2]) },
    ])
    sendEmailMock.mockResolvedValue(undefined)
    const response = await POST(makeRequest({ userIds: ['u1'], title: 'Happy New Year', message: 'Best wishes', channel: 'both', imageUrl: '/api/media/greeting.png', attachments: [{ path: '/api/media/offer.pdf', name: 'Offer.pdf' }] }))
    expect(response.status).toBe(200)
    expect(notificationCreateManyMock).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ imageUrl: '/api/media/greeting.png', attachments: [{ path: '/api/media/offer.pdf', name: 'Offer.pdf' }] })]) })
    expect(sendEmailMock).toHaveBeenCalledWith(expect.any(String), 'Happy New Year', expect.stringContaining('/api/media/greeting.png'), { attachments: [expect.objectContaining({ filename: 'Offer.pdf', contentType: 'application/pdf' })] })
  })
})
