import { describe, expect, it } from 'vitest'
import { formatOrderAddressLatvian } from './order-address'

describe('formatOrderAddressLatvian', () => {
  it('uses the canonical Latvian store address for pickup orders', () => {
    expect(formatOrderAddressLatvian({
      deliveryMethod: 'pickup',
      pickupStoreId: 'imanta',
      address: 'старый адрес',
      city: 'Рига',
    })).toBe('Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija')
  })

  it('preserves customer streets and normalizes Riga spelling', () => {
    expect(formatOrderAddressLatvian({
      deliveryMethod: 'courier',
      address: 'Brivibas iela 1',
      city: 'Riga',
      postalCode: 'LV-1010',
    })).toBe('Brivibas iela 1, Rīga, LV-1010')
  })
})
