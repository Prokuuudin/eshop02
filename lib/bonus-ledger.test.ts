import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { grantWelcomeBonus } from './bonus-ledger'
import type { ExtendedTransactionClient } from '@/lib/prisma'

function makeTx(config: Record<string, unknown> | null = null) {
  return {
    keyValueSetting: { findUnique: vi.fn(async () => (config ? { value: config } : null)) },
    bonusTransaction: { findFirst: vi.fn(async () => null), create: vi.fn() },
    user: { update: vi.fn(async () => ({ bonusPoints: 500 })) },
  } as unknown as ExtendedTransactionClient & {
    keyValueSetting: { findUnique: ReturnType<typeof vi.fn> }
    bonusTransaction: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
    user: { update: ReturnType<typeof vi.fn> }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('grantWelcomeBonus', () => {
  it('credits the configured points once and records a welcome ledger row', async () => {
    const tx = makeTx()

    await grantWelcomeBonus(tx, 'user_1')

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: { bonusPoints: { increment: 500 } },
    }))
    expect(tx.bonusTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user_1', type: 'welcome', points: 500, balanceAfter: 500 }),
    }))
  })

  it('is a no-op when a welcome bonus was already recorded for this user', async () => {
    const tx = makeTx()
    tx.bonusTransaction.findFirst.mockResolvedValue({ id: 'existing' })

    await grantWelcomeBonus(tx, 'user_1')

    expect(tx.user.update).not.toHaveBeenCalled()
    expect(tx.bonusTransaction.create).not.toHaveBeenCalled()
  })

  it('does nothing when the bonus program is disabled', async () => {
    const tx = makeTx({ enabled: false, welcomeBonusPoints: 500 })

    await grantWelcomeBonus(tx, 'user_1')

    expect(tx.bonusTransaction.findFirst).not.toHaveBeenCalled()
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('does nothing when the configured welcome amount is zero', async () => {
    const tx = makeTx({ enabled: true, welcomeBonusPoints: 0 })

    await grantWelcomeBonus(tx, 'user_1')

    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('honors a custom configured amount', async () => {
    const tx = makeTx({ enabled: true, welcomeBonusPoints: 250 })

    await grantWelcomeBonus(tx, 'user_1')

    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { bonusPoints: { increment: 250 } },
    }))
  })
})
