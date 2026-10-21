import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_COMMERCE_SETTINGS } from '@/lib/commerce-settings'

vi.mock('@/lib/shipping-settings-server', () => ({ getShippingSettings: vi.fn(async () => DEFAULT_COMMERCE_SETTINGS) }))

import { GET } from './route'

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/shipping', () => {
  it('reports Paysera as unavailable when the flag is not set', async () => {
    vi.stubEnv('PAYSERA_CHECKOUT_ENABLED', '')
    const body = await (await GET()).json()
    expect(body.payments).toEqual({ paysera: false })
  })

  it('reports Paysera as available when the flag is true', async () => {
    vi.stubEnv('PAYSERA_CHECKOUT_ENABLED', 'true')
    const body = await (await GET()).json()
    expect(body.payments).toEqual({ paysera: true })
  })

  it('still exposes delivery settings without internal notes', async () => {
    const body = await (await GET()).json()
    expect(body.delivery.pickup.enabled).toBe(true)
    expect(body.delivery.pickup.notes).toBe('')
  })
})
