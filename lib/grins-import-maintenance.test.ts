import { describe, expect, it, vi } from 'vitest'
import { assertGrinsCheckoutOpen, grinsMaintenanceClosed, CheckoutMaintenanceError } from './grins-import-maintenance'

describe('shared maintenance gate', () => {
  it('fails closed for absent/malformed configuration', async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) } as never
    expect(await grinsMaintenanceClosed(db)).toBe(false)
    await expect(assertGrinsCheckoutOpen(db)).rejects.toBeInstanceOf(CheckoutMaintenanceError)
  })
  it('keeps a shared row lock inside the order transaction', async () => {
    const query = vi.fn().mockResolvedValue([{ open: true }])
    await assertGrinsCheckoutOpen({ $queryRawUnsafe: query } as never, true)
    expect(query.mock.calls[0][0]).toContain('FOR SHARE')
  })
  it('closed checkout fails before any order transaction starts', async () => {
    await expect(assertGrinsCheckoutOpen({ $queryRawUnsafe: vi.fn().mockResolvedValue([{ open: false }]) } as never)).rejects.toThrow('checkout_maintenance')
  })
})
