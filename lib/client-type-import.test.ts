import { describe, expect, it } from 'vitest'
import { mapClientTypeRow, normalizeRegistrationNumber } from './client-type-import'

describe('client type import', () => {
  it('maps legal clients and keeps the full normalized registration number', () => {
    expect(mapClientTypeRow({ cardNumber: '1234', sourceType: 'Юр', registrationNumber: 'LV 4010-3351-370' })).toEqual({
      cardNumber: '1234', customerType: 'company', registrationNumber: '40103351370',
    })
  })

  it('does not retain personal codes for individuals', () => {
    expect(mapClientTypeRow({ cardNumber: '1234', sourceType: 'Физ', registrationNumber: '010101-12345' })).toEqual({
      cardNumber: '1234', customerType: 'individual', registrationNumber: null,
    })
  })

  it('rejects unknown types and empty registration numbers', () => {
    expect(mapClientTypeRow({ cardNumber: '1', sourceType: null, registrationNumber: null })).toBeNull()
    expect(normalizeRegistrationNumber('')).toBeNull()
  })
})
