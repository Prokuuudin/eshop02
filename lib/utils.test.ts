import { describe, it, expect, afterEach } from 'vitest'
import { formatEuro, formatDate, setLocaleFormatConfig } from './utils'
import { DEFAULT_LOCALE_CONFIG } from './locale-config'

afterEach(() => {
  setLocaleFormatConfig(DEFAULT_LOCALE_CONFIG)
})

describe('formatEuro', () => {
  it('puts the symbol before the amount by default', () => {
    expect(formatEuro(10, 'en-US')).toBe('€10.00')
  })

  it('puts the symbol after the amount when configured', () => {
    setLocaleFormatConfig({ ...DEFAULT_LOCALE_CONFIG, priceFormat: 'symbol_after' })
    expect(formatEuro(10, 'en-US')).toBe('10.00 €')
  })
})

describe('formatDate', () => {
  it('uses the configured global pattern when no options are passed', () => {
    setLocaleFormatConfig({ ...DEFAULT_LOCALE_CONFIG, dateFormat: 'YYYY-MM-DD' })
    expect(formatDate(new Date(2026, 2, 5), 'ru-RU')).toBe('2026-03-05')
  })

  it('ignores the configured pattern when explicit options are passed', () => {
    setLocaleFormatConfig({ ...DEFAULT_LOCALE_CONFIG, dateFormat: 'YYYY-MM-DD' })
    const result = formatDate(new Date(2026, 2, 5), 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    expect(result).toBe('March 5, 2026')
  })

  it('defaults to DD.MM.YYYY before any config is loaded', () => {
    expect(formatDate(new Date(2026, 2, 5), 'ru-RU')).toBe('05.03.2026')
  })
})
