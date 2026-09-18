import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/use-translation', () => ({ useTranslation: () => ({ language: 'ru', t: (key: string) => key }) }))
vi.mock('next/image', () => ({ default: ({ unoptimized: _unoptimized, fill: _fill, ...props }: Record<string, unknown>) => React.createElement('img', props) }))
vi.mock('next/link', () => ({ default: (props: Record<string, unknown>) => React.createElement('a', props) }))
vi.mock('@/components/BestsellersSlider', () => ({ default: () => null }))
vi.mock('@/components/BannerCarousel', () => ({
  default: ({ banners, scrollMode }: { banners: { id: string }[]; scrollMode?: string }) =>
    React.createElement('div', { 'data-testid': 'banner-carousel', 'data-count': banners.length, 'data-scroll-mode': scrollMode ?? 'auto' }),
}))
vi.mock('@/components/Newsletter', () => ({ default: ({ registration }: { registration?: boolean }) =>
  registration ? React.createElement('a', { href: '/auth/register' }, 'Subscribe') : null }))
vi.mock('@/components/ui/Reveal', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))

import SaleBanner, { type PromoBanner } from '@/components/SaleBanner'
import SaleSection from '@/components/SaleSection'
import BannerZoneBlock from '@/components/BannerZoneBlock'

const image: PromoBanner = {
  id: 'image', type: 'image', title: '', subtitle: 'Old subtitle', image: '/ready.png',
  link: '/catalog', ctaLabel: 'Old CTA', ctaStyle: 'primary', bgColor: '#ffffff', textColor: 'dark',
}
describe('storefront banner rendering', () => {
  it('keeps the text promotion beside registration when an image precedes it', () => {
    const html = renderToStaticMarkup(React.createElement(SaleSection, {
      products: [], banners: [image, { ...image, id: 'sale', type: 'sale', title: 'Up to 70%', image: '' }],
    }))
    expect(html).toContain('href="/auth/register"')
    expect(html.indexOf('Up to 70%')).toBeLessThan(html.indexOf('src="/ready.png"'))
    expect(html).toContain('/girl1.png')
  })
  it('keeps a text banner assigned to a carousel inside that carousel', () => {
    const html = renderToStaticMarkup(React.createElement(SaleSection, {
      products: [], banners: [{ ...image, type: 'sale', placement: 'carousel' }],
    }))
    expect(html).toContain('data-count="1"')
    expect(html).not.toContain('/girl1.png')
  })
  it('renders video with playback controls and a separate link button', () => {
    const html = renderToStaticMarkup(React.createElement(SaleBanner, { banner: { ...image, type: 'video', image: '/banner.mp4' } }))
    expect(html).toContain('<video')
    expect(html).toContain('controls=""')
    expect(html).toContain('playsInline=""')
    expect(html).toContain('/banner.mp4')
    expect(html).toContain('href="/catalog"')
    expect(html).toContain('Old CTA')
    expect(html).not.toContain('sale-banner__overlay')
    expect(html).not.toContain('<a href="/catalog"><video')
  })
  it('renders a ready-made image in full without overlay, heading or old CTA', () => {
    const html = renderToStaticMarkup(React.createElement(SaleBanner, { banner: image }))
    expect(html).toContain('/ready.png')
    expect(html).toContain('height:auto')
    expect(html).toContain('href="/catalog"')
    expect(html).not.toContain('sale-banner__overlay')
    expect(html).not.toContain('<h3')
    expect(html).not.toContain('Old CTA')
    expect(html).not.toContain('Old subtitle')
  })
  it('renders the text feature first and preserves the order of remaining banners without products', () => {
    const html = renderToStaticMarkup(React.createElement(SaleSection, {
      products: [], banners: [image, { ...image, id: 'second', image: '/second.png' }, { ...image, id: 'text', type: 'sale', title: 'Text promotion', image: '' }],
    }))
    expect(html.indexOf('Text promotion')).toBeLessThan(html.indexOf('src="/ready.png"'))
    expect(html.indexOf('src="/ready.png"')).toBeLessThan(html.indexOf('src="/second.png"'))
    expect(html).toContain('/girl1.png')
  })
  it('renders banners placed in the carousel through BannerCarousel, separately from the stacked list', () => {
    const html = renderToStaticMarkup(React.createElement(SaleSection, {
      products: [],
      banners: [
        { ...image, type: 'sale', title: 'Feature' },
        { ...image, id: 'listed', image: '/second.png', placement: 'list' },
        { ...image, id: 'carousel-1', placement: 'carousel', scrollMode: 'manual' },
        { ...image, id: 'carousel-2', placement: 'carousel', scrollMode: 'manual' },
      ],
    }))
    expect(html).toContain('/second.png')
    expect(html).toContain('data-testid="banner-carousel"')
    expect(html).toContain('data-count="2"')
    expect(html).toContain('data-scroll-mode="manual"')
  })
  it('keeps everything in the stacked list when no banner requests the carousel', () => {
    const html = renderToStaticMarkup(React.createElement(SaleSection, {
      products: [],
      banners: [{ ...image, type: 'sale', title: 'Feature' }, { ...image, id: 'second', image: '/second.png' }],
    }))
    expect(html).not.toContain('data-testid="banner-carousel"')
    expect(html).toContain('/second.png')
  })
})

describe('other homepage zones', () => {
  it('renders nothing for an empty zone', () => {
    const html = renderToStaticMarkup(React.createElement(BannerZoneBlock, { banners: [] }))
    expect(html).toBe('')
  })
  it('splits a zone into its own list and carousel groups', () => {
    const html = renderToStaticMarkup(React.createElement(BannerZoneBlock, {
      banners: [
        { ...image, id: 'listed', placement: 'list' },
        { ...image, id: 'carousel-1', image: '/second.png', placement: 'carousel' },
        { ...image, id: 'carousel-2', placement: 'carousel' },
      ],
    }))
    expect(html).toContain('/ready.png')
    expect(html).toContain('data-testid="banner-carousel"')
    expect(html).toContain('data-count="2"')
  })
})
