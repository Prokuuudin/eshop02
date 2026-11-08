import { describe, expect, it } from 'vitest'
import { localizeInternalHref } from '@/lib/i18n-routing'

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
