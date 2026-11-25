import { describe, expect, it } from 'vitest'
import { MERGE_NOTE_MAX_LENGTH, checkMergeNote, mergeAuditReason } from './admin-account-merge-reason'

describe('checkMergeNote', () => {
  it('accepts no note for a listed reason and a short plain note', () => {
    expect(checkMergeNote('phone_match', null)).toEqual({ note: null })
    expect(checkMergeNote('phone_match', '   ')).toEqual({ note: null })
    expect(checkMergeNote('customer_confirmed', ' Confirmed  by\nphone call ')).toEqual({ note: 'Confirmed by phone call' })
  })

  it('needs a note for «other» and caps its length', () => {
    expect(checkMergeNote('other', '')).toEqual({ problem: 'required' })
    expect(checkMergeNote('other', 'x'.repeat(MERGE_NOTE_MAX_LENGTH + 1))).toEqual({ problem: 'too_long' })
  })

  it.each([
    'write to someone@example.com',
    'phone 2000 0001',
    'card 1234567',
    'iban LV80BANK0000435195001',
    'password is qwerty',
    'пароль 1',
    'parole: x',
    'token abc',
  ])('refuses obvious personal data or secrets: %s', (note) => {
    expect(checkMergeNote('other', note)).toEqual({ problem: 'personal_data' })
  })

  it('builds the audit reason from the code and the note', () => {
    expect(mergeAuditReason('phone_match', null)).toBe('phone_match')
    expect(mergeAuditReason('other', 'same salon')).toBe('other: same salon')
  })
})
