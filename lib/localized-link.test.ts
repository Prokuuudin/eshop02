import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const received: unknown[] = []
let routeLang: string | undefined = 'lv'

vi.mock('next/navigation', () => ({ useParams: () => (routeLang === undefined ? null : { lang: routeLang }) }))
vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: React.forwardRef<HTMLAnchorElement, { href: unknown; children?: React.ReactNode }>(function MockLink({ href, ...props }, ref) {
      received.push(href)
      return React.createElement('a', { ...props, ref, href: typeof href === 'string' ? href : 'object' })
    }),
  }
})

import LocalizedLink from '@/components/LocalizedLink'

const render = (href: unknown, extra: Record<string, unknown> = {}): unknown => {
  received.length = 0
  renderToStaticMarkup(createElement(LocalizedLink as never, { href, ...extra }, 'x'))
  return received[0]
}

describe('LocalizedLink', () => {
  beforeEach(() => { routeLang = 'lv' })

  it.each([
    ['/', '/lv'],
    ['/#faq', '/lv#faq'],
    ['/catalog?brand=andis&page=2', '/lv/catalog?brand=andis&page=2'],
    ['/catalog?search=a%20b#results', '/lv/catalog?search=a%20b#results'],
    ['/admin/orders?status=pending', '/lv/admin/orders?status=pending'],
    ['/auth/login', '/lv/auth/login'],
  ])('localizes %s on an /lv page', (href, expected) => {
    expect(render(href)).toBe(expected)
  })

  it('uses the language of the current route', () => {
    routeLang = 'en'
    expect(render('/product/20564')).toBe('/en/product/20564')
  })

  it.each([['ru'], [undefined]])('keeps unprefixed hrefs for the default language (route lang %s)', (lang) => {
    routeLang = lang
    expect(render('/catalog?brand=andis#top')).toBe('/catalog?brand=andis#top')
  })

  it.each(['/lv/catalog', '/api/admin/customers/export?email=a', '/docs/terms.pdf', 'https://hairshop.lv/x', '#faq', 'mailto:a@b.c'])(
    'leaves %s unchanged', (href) => {
      expect(render(href)).toBe(href)
    }
  )

  it('passes an object href through unchanged (same object)', () => {
    const href = { pathname: '/catalog', query: { brand: 'andis' }, hash: 'top' }
    expect(render(href)).toBe(href)
  })

  it('forwards the ref and other props', () => {
    const ref = createRef<HTMLAnchorElement>()
    received.length = 0
    const html = renderToStaticMarkup(createElement(LocalizedLink as never, { href: '/wishlist', ref, className: 'c', prefetch: false }, 'x'))
    expect(html).toContain('href="/lv/wishlist"')
    expect(html).toContain('class="c"')
  })
})
