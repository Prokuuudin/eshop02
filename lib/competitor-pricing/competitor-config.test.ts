import { describe, expect, it } from 'vitest'
import {
  CompetitorConfigError,
  canonicalizeCompetitorProductUrl,
  isCompetitorFetchable,
  normalizeCompetitorSource,
  normalizePublicHostname,
  validateCompetitorInput,
} from './competitor-config'

const validInput = {
  name: 'Example Beauty',
  baseUrl: 'https://Example-Beauty.lv/',
  adapterKey: 'jsonld-product',
  accessBasisNote: 'Public product pages, monitoring agreed with management on 2026-10-03.',
}

describe('normalizePublicHostname', () => {
  it.each(['localhost', 'shop.localhost', 'printer.local', 'db.internal', '127.0.0.1', '10.0.0.5', '[::1]', '::1', '169.254.169.254', '2130706433', 'intranet', 'bad_host.lv', '-x.lv', 'a.123'])(
    'rejects %s',
    (host) => expect(normalizePublicHostname(host)).toBeNull(),
  )

  it('lowercases and strips a trailing dot', () => {
    expect(normalizePublicHostname('WWW.Shop.LV.')).toBe('www.shop.lv')
  })
})

describe('normalizeCompetitorSource', () => {
  it('canonicalizes base URL and always allows its own host', () => {
    expect(normalizeCompetitorSource('https://Shop.lv/', ['www.shop.lv'])).toEqual({
      baseUrl: 'https://shop.lv',
      hostname: 'shop.lv',
      allowedHosts: ['shop.lv', 'www.shop.lv'],
    })
  })

  it.each([
    ['ftp scheme', 'ftp://shop.lv'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['credentials', 'https://user:pass@shop.lv'],
    ['non-standard port', 'https://shop.lv:8443'],
    ['plain http', 'http://shop.lv'],
    ['ip literal', 'https://127.0.0.1'],
    ['metadata ip', 'https://169.254.169.254/latest/meta-data'],
    ['hex ip', 'https://0x7f.1/'],
    ['localhost', 'https://localhost'],
  ])('rejects %s', (_label, url) => {
    expect(() => normalizeCompetitorSource(url)).toThrow(CompetitorConfigError)
  })

  it('rejects allowed hosts unrelated to the competitor (no mixing sources)', () => {
    expect(() => normalizeCompetitorSource('https://shop.lv', ['other-shop.lv'])).toThrow(/unrelated/)
    expect(() => normalizeCompetitorSource('https://shop.lv', ['evilshop.lv'])).toThrow(/unrelated/)
    expect(() => normalizeCompetitorSource('https://shop.lv', ['localhost'])).toThrow(CompetitorConfigError)
  })
})

describe('canonicalizeCompetitorProductUrl', () => {
  const hosts = ['shop.lv', 'www.shop.lv']

  it('keeps meaningful query, drops fragment and tracking params', () => {
    expect(canonicalizeCompetitorProductUrl('https://WWW.shop.lv/p/123?id=5&utm_source=x&fbclid=y#reviews', hosts))
      .toBe('https://www.shop.lv/p/123?id=5')
  })

  it.each([
    ['foreign host', 'https://other.lv/p/1'],
    ['lookalike suffix', 'https://shop.lv.evil.com/p/1'],
    ['subdomain not in allowlist', 'https://cdn.shop.lv/p/1'],
    ['credentials', 'https://a:b@shop.lv/p/1'],
    ['port', 'https://shop.lv:444/p/1'],
    ['plain http', 'http://shop.lv/p/1'],
    ['scheme', 'file:///etc/passwd'],
  ])('rejects %s', (_label, url) => {
    expect(() => canonicalizeCompetitorProductUrl(url, hosts)).toThrow(CompetitorConfigError)
  })
})

describe('validateCompetitorInput', () => {
  it('accepts a valid competitor with safe defaults (disabled by default)', () => {
    const result = validateCompetitorInput(validInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ hostname: 'example-beauty.lv', enabled: false, maxConcurrency: 1, requestDelayMs: 5000 })
  })

  it.each([
    ['missing access basis note', { accessBasisNote: undefined }],
    ['too short access basis note', { accessBasisNote: 'ok' }],
    ['unknown adapter', { adapterKey: 'generic-scraper' }],
    ['aggressive delay', { requestDelayMs: 100 }],
    ['too much concurrency', { maxConcurrency: 10 }],
    ['too frequent polling', { pollIntervalMinutes: 5 }],
    ['huge response limit', { maxResponseBytes: 50_000_000 }],
    ['credentials field', { password: 'secret' }],
    ['private base url', { baseUrl: 'https://192.168.1.10' }],
    ['http base url', { baseUrl: 'http://example-beauty.lv' }],
  ])('rejects %s', (_label, patch) => {
    expect(validateCompetitorInput({ ...validInput, ...patch }).ok).toBe(false)
  })
})

describe('isCompetitorFetchable', () => {
  it('requires enabled and active', () => {
    expect(isCompetitorFetchable({ enabled: true, status: 'active' })).toBe(true)
    expect(isCompetitorFetchable({ enabled: false, status: 'active' })).toBe(false)
    expect(isCompetitorFetchable({ enabled: true, status: 'blocked' })).toBe(false)
    expect(isCompetitorFetchable({ enabled: true, status: 'paused' })).toBe(false)
  })
})
