import { describe, expect, it } from 'vitest'
import { invoicePdfFileName } from './invoice-pdf'

describe('invoicePdfFileName', () => {
  it('always produces PDF download names', () => {
    expect(invoicePdfFileName('16266', 'lv')).toBe('invoice-16266.pdf')
    expect(invoicePdfFileName('16266', 'en')).toBe('invoice-16266-en.pdf')
  })
})
