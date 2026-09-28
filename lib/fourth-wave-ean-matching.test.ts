import { describe, expect, it } from 'vitest'
import { barcodeQuality, measurementConflicts, numericTokens } from './fourth-wave-ean-matching'

describe('fourth-wave EAN matching safeguards', () => {
  it('keeps a leading zero as identity data', () => expect(barcodeQuality('01234565').leadingZero).toBe(true))
  it('detects a valid EAN-13 checksum', () => expect(barcodeQuality('8008277263779').kind).toBe('VALID_STANDARD'))
  it('blocks an invalid standard-looking checksum', () => expect(barcodeQuality('8008277263778').kind).toBe('INVALID_STANDARD_LOOKING'))
  it('does not pretend an internal code is EAN', () => expect(barcodeQuality('BMISK').kind).toBe('INTERNAL_NON_STANDARD'))
  it('detects volume mismatch', () => expect(measurementConflicts('Shampoo 250 ml', 'Shampoo 1000 ml')).toEqual(['250ml != 1000ml']))
  it('detects Cyrillic volume mismatch', () => expect(measurementConflicts('Шампунь 75мл', 'Shampoo 100ml')).toEqual(['75ml != 100ml']))
  it('detects model-number-like dimensional mismatch', () => expect(measurementConflicts('Brush 25 mm', 'Brush 32 mm')).toEqual(['25mm != 32mm']))
  it('preserves model and shade numbers', () => expect(numericTokens('Color № 09, 6%')).toEqual(['9', '6']))
})
