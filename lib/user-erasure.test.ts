import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn() },
    savedAddress: { findMany: vi.fn().mockResolvedValue([]) },
    productNewsSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    returnRequest: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    wishlistItem: { findMany: vi.fn().mockResolvedValue([]) },
    userNotification: { findMany: vi.fn().mockResolvedValue([]) },
    accessRequest: { findMany: vi.fn().mockResolvedValue([]) },
    invitationToken: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock('@/lib/server-auth', () => ({ hashPassword: vi.fn() }))
vi.mock('@/lib/newsletter-store', () => ({ unsubscribeFromMarketing: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { exportUserData } from './user-erasure'

describe('exportUserData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('with a real id, scopes order/user/wishlist queries by userId (and email as a fallback where applicable)', async () => {
    await exportUserData({ id: 'user-1', email: 'A@B.com' })
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ userId: 'user-1' }, { email: 'a@b.com' }] } })
    )
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }))
    expect(prisma.wishlistItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }))
  })

  it('with id=null (guest checkout), scopes everything by email and returns a synthetic profile instead of 500ing on a missing account', async () => {
    const result = await exportUserData({ id: null, email: 'Guest@B.com' })

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'guest@b.com' } }))
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.wishlistItem.findMany).not.toHaveBeenCalled()
    expect(prisma.userNotification.findMany).not.toHaveBeenCalled()
    expect(prisma.invitationToken.findMany).not.toHaveBeenCalled()

    // Account-scoped tables that don't apply to a guest come back empty rather than throwing.
    expect(result.wishlist).toEqual([])
    expect(result.notifications).toEqual([])
    expect(result.invitations).toEqual([])
    // profile is a synthetic stand-in, not a real User row, so the PDF renderer still has something to show.
    expect(result.profile).toEqual({ email: 'guest@b.com', note: 'Guest checkout - no registered account' })
  })

  it('with id=null, still pulls orders/returns/saved-addresses that are genuinely email-scoped in the schema', async () => {
    vi.mocked(prisma.returnRequest.findMany).mockResolvedValue([{ id: 'ret-1' }] as never)
    const result = await exportUserData({ id: null, email: 'guest@b.com' })
    expect(prisma.returnRequest.findMany).toHaveBeenCalledWith({ where: { email: 'guest@b.com' } })
    expect(result.returnRequests).toEqual([{ id: 'ret-1' }])
  })
})
