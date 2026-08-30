import { describe, expect, it } from 'vitest'
import {
  createNoCardDraft,
  getCardHolderEdit,
  isValidCardNumber,
  isValidCompanyDraft,
  normalizeCardDigits,
  type CardHolder,
} from './client-barcodes-model'

describe('client barcode model', () => {
  it('normalizes and validates the supported card number range', () => {
    expect(normalizeCardDigits('12-34 5')).toBe('12345')
    expect(isValidCardNumber('1234')).toBe(true)
    expect(isValidCardNumber('123456')).toBe(true)
    expect(isValidCardNumber('123')).toBe(false)
    expect(isValidCardNumber('1234567')).toBe(false)
  })

  it('requires a name and eleven-digit registration number only for companies', () => {
    expect(isValidCompanyDraft(createNoCardDraft('Anna'))).toBe(true)
    expect(isValidCompanyDraft({ customerType: 'company', companyName: 'SIA Hair', registrationNumber: 'LV-12345678901', cardNumber: '' })).toBe(true)
    expect(isValidCompanyDraft({ customerType: 'company', companyName: '', registrationNumber: '12345678901', cardNumber: '' })).toBe(false)
  })

  it('hides generated local email addresses from editable customer details', () => {
    const holder = {
      id: '1', email: '1234@client.local', name: null, phone: null, cardNumber: '1234',
      bonusPoints: 0, companyName: null, customerType: null, registrationNumber: null,
      vatNumber: null, legalAddress: null, address: null, bankName: null, iban: null,
      personalCodeMasked: null, registered: false, registeredAt: null, updatedAt: '2026-01-01',
    } satisfies CardHolder

    expect(getCardHolderEdit(holder)).toEqual({
      name: '', email: '', phone: '', customerType: 'individual', registrationNumber: '',
    })
  })
})
