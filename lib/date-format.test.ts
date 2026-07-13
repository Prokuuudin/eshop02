import { describe, it, expect } from 'vitest'
import { formatDateWithPattern } from './date-format'

describe('formatDateWithPattern', () => {
  it('formats DD.MM.YYYY with zero-padded day and month', () => {
    expect(formatDateWithPattern(new Date(2026, 0, 5), 'DD.MM.YYYY')).toBe('05.01.2026')
  })

  it('formats MM/DD/YYYY', () => {
    expect(formatDateWithPattern(new Date(2026, 11, 25), 'MM/DD/YYYY')).toBe('12/25/2026')
  })

  it('formats YYYY-MM-DD', () => {
    expect(formatDateWithPattern(new Date(2026, 5, 9), 'YYYY-MM-DD')).toBe('2026-06-09')
  })

  it('pads single-digit day and month for all patterns', () => {
    const date = new Date(2026, 2, 3) // 3 March 2026
    expect(formatDateWithPattern(date, 'DD.MM.YYYY')).toBe('03.03.2026')
    expect(formatDateWithPattern(date, 'MM/DD/YYYY')).toBe('03/03/2026')
    expect(formatDateWithPattern(date, 'YYYY-MM-DD')).toBe('2026-03-03')
  })

  it('handles the last day of the year correctly', () => {
    expect(formatDateWithPattern(new Date(2026, 11, 31), 'YYYY-MM-DD')).toBe('2026-12-31')
  })

  it('applies a specific IANA timezone when provided, overriding local getters', () => {
    // 2026-01-01T23:30:00Z is already 2026-01-02 in Europe/Riga (UTC+2/+3) —
    // deterministic regardless of the test runner's own local timezone.
    const date = new Date('2026-01-01T23:30:00.000Z')
    expect(formatDateWithPattern(date, 'YYYY-MM-DD', 'Europe/Riga')).toBe('2026-01-02')
  })

  it('without timeZone, uses the Date object\'s own local getters', () => {
    const date = new Date(2026, 5, 15) // constructed in local time — no conversion needed
    expect(formatDateWithPattern(date, 'YYYY-MM-DD')).toBe('2026-06-15')
  })
})
