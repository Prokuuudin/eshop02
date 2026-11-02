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
  it('omits the offer when no campaigns match or prices were redacted', () => {
    expect(renderToStaticMarkup(React.createElement(ProductCampaignOffers, { product: {} as Product }))).toBe('')
  })
})
