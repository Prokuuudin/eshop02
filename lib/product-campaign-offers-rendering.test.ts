import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Product } from '@/data/products'

vi.mock('@/lib/use-translation', () => ({ useTranslation: () => ({ language: 'ru' }) }))
import ProductCampaignOffers from '@/components/ProductCampaignOffers'

describe('campaign offer display', () => {
  it('shows the percentage and order threshold where the discount applies', () => {
    const product = { campaignOffers: [{ id: 'beauty', discountPercent: 20, minOrderAmount: 100 }] } as Product
    const html = renderToStaticMarkup(React.createElement(ProductCampaignOffers, { product }))
    expect(html).toContain('−20%')
    expect(html).not.toContain('в корзине')
    expect(html).toContain('при заказе от')
    expect(html).toContain('100')
  })
  it('shows a second-item badge without any price', () => {
    const product = { price: 12.5, secondItemOffers: [{ id: 'kemon-2nd', name: 'Kemon', discountPercent: 50, minOrderAmount: 0 }] } as Product
    const html = renderToStaticMarkup(React.createElement(ProductCampaignOffers, { product }))
    expect(html).toContain('2-й товар −50%')
    expect(html).toContain('Kemon')
    expect(html).not.toContain('12')
  })
  it('shows overlapping campaigns with the same terms only once', () => {
    const product = {
      campaignOffers: [
        { id: 'all-products', name: '25%', discountPercent: 25, minOrderAmount: 0 },
        { id: 'sleek-line', name: '25% sleek line', discountPercent: 25, minOrderAmount: 0 },
      ],
    } as Product
    const html = renderToStaticMarkup(React.createElement(ProductCampaignOffers, { product }))
    expect(html.match(/−25%/g)).toHaveLength(1)
    expect(html).toContain('25% sleek line')
    expect(html).not.toContain('>25%</span>')
  })
  it('keeps offers with different order thresholds visible', () => {
    const product = {
      campaignOffers: [
        { id: 'direct', discountPercent: 25, minOrderAmount: 0 },
        { id: 'bulk', discountPercent: 25, minOrderAmount: 100 },
      ],
    } as Product
    const html = renderToStaticMarkup(React.createElement(ProductCampaignOffers, { product }))
    expect(html.match(/−25%/g)).toHaveLength(2)
    expect(html).toContain('100')
  })
  it('omits the offer when no campaigns match or prices were redacted', () => {
    expect(renderToStaticMarkup(React.createElement(ProductCampaignOffers, { product: {} as Product }))).toBe('')
  })
})
