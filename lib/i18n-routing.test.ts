import { describe, expect, it } from 'vitest'
import { localizeInternalHref, negotiateLanguage } from '@/lib/i18n-routing'

describe('localizeInternalHref', () => {
  it.each([
    ['/', 'lv', '/lv'],
    ['/', 'en', '/en'],
    ['/catalog', 'lv', '/lv/catalog'],
    ['/catalog?brand=andis&page=2', 'en', '/en/catalog?brand=andis&page=2'],
    ['/#faq', 'lv', '/lv#faq'],
    ['/?x=1#top', 'lv', '/lv?x=1#top'],
    ['/product/20564', 'lv', '/lv/product/20564'],
    ['/admin/orders?status=pending', 'en', '/en/admin/orders?status=pending'],
  ] as const)('prefixes %s for %s', (href, lang, expected) => {
    expect(localizeInternalHref(href, lang)).toBe(expected)
  })

  it.each(['/', '/catalog', '/#faq', '/catalog?brand=andis'])('keeps %s unchanged for the default language', (href) => {
    expect(localizeInternalHref(href, 'ru')).toBe(href)
  })

  it.each([
    '/lv/catalog', '/en', '/ru/catalog', '/lv?x=1',
    '/api/admin/customers/export?email=a', '/api/media/1.jpg', '/_next/static/x.js',
    '/docs/terms.pdf', '/hero.jpg',
    'https://hairshop.lv/x', '//cdn.example.com/x', 'mailto:a@b.c', 'tel:+371', '#faq', 'catalog',
  ])('leaves %s unchanged', (href) => {
    expect(localizeInternalHref(href, 'lv')).toBe(href)
  })

  it('does not treat a path that only starts with a language code as prefixed', () => {
    expect(localizeInternalHref('/lvl', 'lv')).toBe('/lv/lvl')
    expect(localizeInternalHref('/english', 'en')).toBe('/en/english')
  })
})

describe('negotiateLanguage', () => {
  it.each([
    ['lv-LV,lv;q=0.9,en-US;q=0.8,en;q=0.7', 'lv'],
    ['ru-RU,ru;q=0.9,en-US;q=0.8', 'ru'],
    ['en-GB,en;q=0.9', 'en'],
    ['de-DE,de;q=0.9,en;q=0.8', 'en'],
    ['en;q=0.5, LV;q=0.8', 'lv'],
    ['ru, lv', 'ru'],
    ['ru;q=0, en;q=0.1', 'en'],
  ] as const)('picks the preferred supported language from %s', (header, expected) => {
    expect(negotiateLanguage(header)).toBe(expected)
  })

  it.each(['de-DE,de;q=0.9', '*', 'lv;q=0', 'xx;q=abc'])('returns null when %s has no supported language', (header) => {
    expect(negotiateLanguage(header)).toBeNull()
  })
})
