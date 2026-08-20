import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const findManyMock = vi.hoisted(() => vi.fn())
const createManyMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    productNewsSubscription: { findMany: findManyMock },
    userNotification: { createMany: createManyMock },
  },
}))

import { notifyPriceChange, notifyRestock, notifyPromo } from './product-news-notify'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notifyPriceChange', () => {
  it('notifies only price-flag subscribers with old/new price in the message', async () => {
    findManyMock.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }])

    await notifyPriceChange('p1', 'Shampoo', 10, 8)

    expect(findManyMock).toHaveBeenCalledWith({
      where: { productId: 'p1', notifyPrice: true },
      select: { userId: true },
    })
    expect(createManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'u1', type: 'info', channel: 'app', link: '/product/p1' }),
        expect.objectContaining({ userId: 'u2', type: 'info', channel: 'app', link: '/product/p1' }),
      ],
    })
    const [{ data }] = createManyMock.mock.calls[0]
    expect(data[0].message).toContain('8.00')
    expect(data[0].message).toContain('10.00')
  })

  it('does nothing when there are no subscribers', async () => {
    findManyMock.mockResolvedValue([])
    await notifyPriceChange('p1', 'Shampoo', 10, 8)
    expect(createManyMock).not.toHaveBeenCalled()
  })
})

describe('notifyRestock', () => {
  it('notifies stock-flag subscribers with a success-type message', async () => {
    findManyMock.mockResolvedValue([{ userId: 'u1' }])
    await notifyRestock('p1', 'Shampoo')
    expect(findManyMock).toHaveBeenCalledWith({
      where: { productId: 'p1', notifyStock: true },
      select: { userId: true },
    })
    expect(createManyMock).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'u1', type: 'success', channel: 'app' })],
    })
  })
})

describe('notifyPromo', () => {
  it('uses the given message when provided', async () => {
    findManyMock.mockResolvedValue([{ userId: 'u1' }])
    await notifyPromo('p1', 'Shampoo', 'Скидка 20% сегодня')
    const [{ data }] = createManyMock.mock.calls[0]
    expect(data[0]).toMatchObject({ userId: 'u1', type: 'promo', message: 'Скидка 20% сегодня' })
  })

  it('falls back to a generic message when none is given', async () => {
    findManyMock.mockResolvedValue([{ userId: 'u1' }])
    await notifyPromo('p1', 'Shampoo', undefined)
    const [{ data }] = createManyMock.mock.calls[0]
    expect(data[0].message).toContain('Shampoo')
  })
})
