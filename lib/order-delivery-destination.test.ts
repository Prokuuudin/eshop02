import { describe, expect, it } from 'vitest'
import { getOrderDeliveryDestination } from './order-delivery-destination'

describe('order delivery destination display model', () => {
  it('exposes a locker snapshot for customer and admin order views', () => {
    expect(getOrderDeliveryDestination({ deliveryMethod: 'post', address: '', city: '', deliveryLocation: {
      id: '9192', provider: 'omniva', type: 'locker', country: 'LV', name: 'Alojas Mini TOP pakomāts', address: 'Rīgas iela 1B', city: 'Aloja', postalCode: '9192',
    } })).toEqual({ carrier: 'omniva', name: 'Alojas Mini TOP pakomāts', address: 'Rīgas iela 1B', city: 'Aloja', postalCode: '9192' })
  })

  it('resolves a saved pickup store and keeps legacy pickup orders compatible', () => {
    expect(getOrderDeliveryDestination({ deliveryMethod: 'pickup', pickupStoreId: 'imanta', address: '', city: '' })?.name).toBe('imanta')
    expect(getOrderDeliveryDestination({ deliveryMethod: 'pickup', address: 'Legacy store address', city: 'Rīga' })).toBeNull()
  })
})
