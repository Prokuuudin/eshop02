import { describe, expect, it } from 'vitest'
import { isValidCardNumber, normalizeCardNumber } from './card-number'

describe('normalizeCardNumber', () => {
  it.each([
    ['1', '1'],
    ['0001', '1'],
    ['0045', '45'],
    ['000000', '0'],
    [' 00 45 ', '45'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeCardNumber(input)).toBe(expected)
  })

  it('keeps a legacy non-numeric identifier compatible', () => {
    expect(normalizeCardNumber(' ab-123 ')).toBe('AB-123')
  })

  it('accepts new numeric card numbers from one to six digits', () => {
    expect(isValidCardNumber('1')).toBe(true)
    expect(isValidCardNumber('0045')).toBe(true)
    expect(isValidCardNumber('123456')).toBe(true)
    expect(isValidCardNumber('1234567')).toBe(false)
    expect(isValidCardNumber('AB-123')).toBe(false)
  })
})
