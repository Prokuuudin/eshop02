import { describe, expect, it } from 'vitest'
import { sanitizeStoredLink } from '@/lib/safe-link'

describe('sanitizeStoredLink', () => {
  it('allows internal paths', () => {
    expect(sanitizeStoredLink('/catalog')).toBe('/catalog')
    expect(sanitizeStoredLink('/catalog?sale=1#top')).toBe('/catalog?sale=1#top')
  })

  it('allows explicit http(s) URLs', () => {
    expect(sanitizeStoredLink('https://hairshop.lv/akcija')).toBe('https://hairshop.lv/akcija')
    expect(sanitizeStoredLink('HTTP://example.com')).toBe('HTTP://example.com')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeStoredLink('  /catalog  ')).toBe('/catalog')
  })

  it('rejects executable schemes', () => {
    expect(sanitizeStoredLink('javascript:alert(1)')).toBe('')
    expect(sanitizeStoredLink('JaVaScRiPt:alert(1)')).toBe('')
    expect(sanitizeStoredLink('data:text/html,<script>alert(1)</script>')).toBe('')
    expect(sanitizeStoredLink('vbscript:msgbox(1)')).toBe('')
  })

  it('rejects protocol-relative and backslash-relative URLs', () => {
    expect(sanitizeStoredLink('//evil.com')).toBe('')
    expect(sanitizeStoredLink('/\\evil.com')).toBe('')
  })

  it('rejects schemeless hosts and non-strings', () => {
    expect(sanitizeStoredLink('www.example.com')).toBe('')
    expect(sanitizeStoredLink('')).toBe('')
    expect(sanitizeStoredLink(null)).toBe('')
    expect(sanitizeStoredLink(undefined)).toBe('')
    expect(sanitizeStoredLink(42)).toBe('')
  })
})
