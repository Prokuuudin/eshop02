import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/use-translation', () => ({ useTranslation: () => ({ language: 'ru', t: (key: string) => key }) }))
vi.mock('next/image', () => ({ default: ({ unoptimized: _unoptimized, fill: _fill, ...props }: Record<string, unknown>) => React.createElement('img', props) }))
vi.mock('next/link', () => ({ default: (props: Record<string, unknown>) => React.createElement('a', props) }))
vi.mock('@/components/BestsellersSlider', () => ({ default: () => null }))
vi.mock('@/components/Newsletter', () => ({ default: () => null }))
vi.mock('@/components/ui/Reveal', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))

import SaleBanner, { type PromoBanner } from '@/components/SaleBanner'
import SaleSection from '@/components/SaleSection'

const image: PromoBanner = {
  id: 'image', type: 'image', title: '', subtitle: 'Old subtitle', image: '/ready.png',
  link: '/catalog', ctaLabel: 'Old CTA', ctaStyle: 'primary', bgColor: '#ffffff', textColor: 'dark',
}
describe('storefront banner rendering', () => {
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
  it('renders every supplied published banner in order even without sale products', () => {
    const html = renderToStaticMarkup(React.createElement(SaleSection, {
      products: [], banners: [image, { ...image, id: 'second', image: '/second.png' }, { ...image, id: 'text', type: 'sale', title: 'Text promotion', image: '' }],
    }))
    expect(html.indexOf('/ready.png')).toBeLessThan(html.indexOf('/second.png'))
    expect(html.indexOf('/second.png')).toBeLessThan(html.indexOf('Text promotion'))
    expect(html).not.toContain('/girl1.png')
  })
})
