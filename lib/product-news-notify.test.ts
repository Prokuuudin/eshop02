import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/marketing-suppression', async () => (await import('@/tests/helpers/marketing-suppression-mock')).marketingSuppressionPassthrough())
vi.mock('server-only', () => ({}))

const findManyMock = vi.hoisted(() => vi.fn())
const createManyMock = vi.hoisted(() => vi.fn())
const sendEmailMock = vi.hoisted(() => vi.fn())
const logOperationalEventMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    productNewsSubscription: { findMany: findManyMock },
    userNotification: { createMany: createManyMock },
  },
}))
vi.mock('@/lib/mailer', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: logOperationalEventMock }))

import { notifyPriceChange, notifyPromo, notifyRestock } from './product-news-notify'

const subscriber = (channel?: string, email = 'user@example.com') => ({
  userId: `user-${channel ?? 'default'}`,
  user: { email, notificationChannel: channel },
})

beforeEach(() => {
  vi.clearAllMocks()
  createManyMock.mockResolvedValue({ count: 1 })
  sendEmailMock.mockResolvedValue(undefined)
})

describe('product-news channel delivery', () => {
  it('app creates an inbox notification and does not send email', async () => {
    findManyMock.mockResolvedValue([subscriber('app')])
    await notifyPriceChange('p1', 'Shampoo', 10, 8)

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(createManyMock).toHaveBeenCalledWith({ data: [expect.objectContaining({
      userId: 'user-app', type: 'info', channel: 'app', emailSent: false, link: '/product/p1',
    })] })
    expect(findManyMock).toHaveBeenCalledWith({
      where: { productId: 'p1', notifyPrice: true },
      select: { userId: true, user: { select: { email: true, notificationChannel: true } } },
    })
  })

  it('email sends immediately without creating an inbox notification', async () => {
    findManyMock.mockResolvedValue([subscriber('email')])
    await notifyRestock('p1', 'Shampoo')

    expect(sendEmailMock).toHaveBeenCalledWith('user@example.com', 'Товар снова в наличии', expect.stringContaining('Shampoo'))
    expect(createManyMock).not.toHaveBeenCalled()
  })

  it('both sends email and creates an inbox notification marked emailSent', async () => {
    findManyMock.mockResolvedValue([subscriber('both')])
    await notifyPromo('p1', 'Shampoo', 'Скидка 20% сегодня')

    expect(sendEmailMock).toHaveBeenCalledOnce()
    expect(createManyMock).toHaveBeenCalledWith({ data: [expect.objectContaining({
      userId: 'user-both', type: 'promo', channel: 'both', emailSent: true,
      message: 'Скидка 20% сегодня',
    })] })
  })

  it('defaults a missing or unknown server setting to app', async () => {
    findManyMock.mockResolvedValue([subscriber(undefined), subscriber('invalid')])
    await notifyRestock('p1', 'Shampoo')

    expect(sendEmailMock).not.toHaveBeenCalled()
    const data = createManyMock.mock.calls[0][0].data
    expect(data).toHaveLength(2)
    expect(data.every((row: { channel: string }) => row.channel === 'app')).toBe(true)
  })

  it.each(['email', 'both'])('does not fail for %s when email is absent', async (channel) => {
    findManyMock.mockResolvedValue([subscriber(channel, '')])
    await expect(notifyRestock('p1', 'Shampoo')).resolves.toBeUndefined()

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(logOperationalEventMock).toHaveBeenCalledWith(expect.objectContaining({
      event: 'product_news_email_skipped', reason: 'missing_or_invalid_email',
    }))
    if (channel === 'both') expect(createManyMock).toHaveBeenCalledOnce()
    else expect(createManyMock).not.toHaveBeenCalled()
  })

  it('does nothing when there are no subscribers', async () => {
    findManyMock.mockResolvedValue([])
    await notifyPriceChange('p1', 'Shampoo', 10, 8)
    expect(createManyMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})

describe('product-news — «Рассылки запрещены»', () => {
  it('sends no email to a blocked subscriber; the in-app notification still arrives, flagged as not emailed', async () => {
    const suppression = await import('@/lib/marketing-suppression')
    vi.mocked(suppression.sendMarketingEmail).mockResolvedValueOnce('suppressed')
    findManyMock.mockResolvedValue([subscriber('both')])

    await notifyPromo('p1', 'Shampoo', 'Sale')

    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(suppression.sendMarketingEmail).toHaveBeenCalledWith('user@example.com', expect.any(String), expect.any(String), { category: 'product_news', userId: 'user-both' })
    expect(createManyMock).toHaveBeenCalledWith({ data: [expect.objectContaining({ userId: 'user-both', emailSent: false })] })
  })
})
