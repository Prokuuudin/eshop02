import { describe, expect, it } from 'vitest'
import {
  classifyClientSaveFailure,
  createNoCardDraft,
  isCompleteClientStepUp,
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
      registered: false, registeredAt: null, updatedAt: '2026-01-01',
    } satisfies CardHolder

    expect(getCardHolderEdit(holder)).toEqual({
      name: '', email: '', phone: '', customerType: 'individual', registrationNumber: '',
    })
  })
})

describe('classifyClientSaveFailure', () => {
  it.each([
    [400, 'change_reason_required', 'step_up_required'],
    [401, 'reauthentication_required', 'step_up_required'],
    [401, 'reauthentication_failed', 'step_up_failed'],
    [401, 'unauthorized', 'session_expired'],
    [403, 'super_admin_required', 'staff_account'],
    [403, 'forbidden', 'forbidden'],
    [403, 'Origin not allowed', 'origin_rejected'],
    [409, 'email_taken', 'email_taken'],
    [400, 'invalid_request', 'invalid'],
    [409, 'optimistic_conflict', 'conflict'],
    [409, 'concurrent_update', 'conflict'],
    [404, 'not_found', 'not_found'],
    [429, undefined, 'rate_limited'],
    [500, 'server_error', 'unknown'],
  ] as const)('HTTP %i %s → %s', (status, code, expected) => {
    expect(classifyClientSaveFailure(status, code)).toBe(expected)
  })

  it('never reports step-up or a staff account as a plain permission error', () => {
    for (const code of ['change_reason_required', 'reauthentication_required', 'reauthentication_failed', 'super_admin_required']) {
      expect(classifyClientSaveFailure(403, code)).not.toBe('forbidden')
    }
  })
})

describe('isCompleteClientStepUp', () => {
  it('needs a password, a six-digit code and a reason of at least five characters', () => {
    expect(isCompleteClientStepUp({ currentPassword: 'pw', mfaCode: ' 123456 ', reason: 'typo fix' })).toBe(true)
    expect(isCompleteClientStepUp({ currentPassword: '', mfaCode: '123456', reason: 'typo fix' })).toBe(false)
    expect(isCompleteClientStepUp({ currentPassword: 'pw', mfaCode: '12345', reason: 'typo fix' })).toBe(false)
    expect(isCompleteClientStepUp({ currentPassword: 'pw', mfaCode: '123456', reason: 'fix' })).toBe(false)
  })
})
