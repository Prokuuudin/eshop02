import { describe, expect, it, vi } from 'vitest'
import { initializeGrinsCheckoutState, readGrinsCheckoutState } from './grins-checkout-preparation'

describe('explicit checkout state preparation', () => {
  it('reports missing state without writing or treating it as open', async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) } as never
    expect(await readGrinsCheckoutState(db)).toBe('missing')
  })
  it('uses INSERT DO NOTHING and preserves a closed row', async () => {
    const execute = vi.fn().mockResolvedValue(0)
    const db = { $executeRawUnsafe: execute, $queryRawUnsafe: vi.fn().mockResolvedValue([{ value: { checkoutClosed: true } }]) } as never
    expect(await initializeGrinsCheckoutState(db)).toEqual({ created: false, checkoutClosed: true })
    expect(execute.mock.calls[0][0]).toContain('ON CONFLICT (key) DO NOTHING')
    expect(execute.mock.calls[0][0]).not.toContain('DO UPDATE')
  })
  it('does not silently repair malformed existing state', async () => {
    const db = { $executeRawUnsafe: vi.fn().mockResolvedValue(0), $queryRawUnsafe: vi.fn().mockResolvedValue([{ value: { checkoutClosed: 'false' } }]) } as never
    await expect(initializeGrinsCheckoutState(db)).rejects.toThrow('invalid_checkout_state')
  })
})
