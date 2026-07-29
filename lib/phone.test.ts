import { describe, expect, it } from 'vitest'
import { normalizePhoneInputValue } from './phone'

describe('normalizePhoneInputValue', () => {
  it('keeps an E.164 number', () => {
    expect(normalizePhoneInputValue('+37120000000')).toBe('+37120000000')
  })

  it('restores formatted saved numbers instead of clearing the input', () => {
    expect(normalizePhoneInputValue('+371 20 000 000')).toBe('+37120000000')
  })

  it('uses Latvia for a national number', () => {
    expect(normalizePhoneInputValue('20 000 000')).toBe('+37120000000')
  })
})
