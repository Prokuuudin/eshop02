import { describe, it, expect } from 'vitest'
import { derivePkLast3, normalizeSubmittedCode } from './personal-code'

describe('derivePkLast3', () => {
  it('takes the last 3 digits of a personal code', () => {
    expect(derivePkLast3('010570-10221')).toBe('221')
  })

  it('takes the last 3 digits of a company registration number, ignoring the LV prefix', () => {
    expect(derivePkLast3('LV40003578116')).toBe('116')
  })

  it('trims surrounding whitespace before extracting', () => {
    expect(derivePkLast3('  40103714999  ')).toBe('999')
  })

  it('returns null for a blank value', () => {
    expect(derivePkLast3('')).toBeNull()
    expect(derivePkLast3('   ')).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(derivePkLast3(null)).toBeNull()
    expect(derivePkLast3(undefined)).toBeNull()
  })

  it('returns null when fewer than 3 alphanumeric characters remain', () => {
    expect(derivePkLast3('12')).toBeNull()
  })

  it('uppercases the result', () => {
    expect(derivePkLast3('lv40003578abc')).toBe('ABC')
  })
})

describe('normalizeSubmittedCode', () => {
  it('trims, strips non-alphanumeric characters, and uppercases', () => {
    expect(normalizeSubmittedCode(' 221 ')).toBe('221')
    expect(normalizeSubmittedCode('2-2-1')).toBe('221')
    expect(normalizeSubmittedCode('a2b')).toBe('A2B')
  })

  it('returns an empty string for blank input', () => {
    expect(normalizeSubmittedCode('   ')).toBe('')
  })
})
