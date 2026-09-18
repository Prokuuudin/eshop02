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
    expect(html).toContain('Скидка 20%')
    expect(html).toContain('в корзине')
    expect(html).toContain('при заказе от')
    expect(html).toContain('100')
  })
  it('omits the offer when no campaigns match or prices were redacted', () => {
    expect(renderToStaticMarkup(React.createElement(ProductCampaignOffers, { product: {} as Product }))).toBe('')
  })
})
