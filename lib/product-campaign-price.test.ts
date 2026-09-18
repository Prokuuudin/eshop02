import { describe, expect, it } from 'vitest';
import { getProductCampaignPrice } from './product-campaign-price';

describe('campaign display price', () => {
  const product = { price: 10, campaignOffers: [{ id: 'promo', discountPercent: 20, minOrderAmount: 0 }] };
  it('shows the discounted price without mutating the catalog price', () => {
    expect(getProductCampaignPrice(product)).toEqual({ price: 8, oldPrice: 10 });
    expect(product.price).toBe(10);
  });
  it('honors the old price setting', () => {
    expect(getProductCampaignPrice({ ...product, campaignOffers: [{ ...product.campaignOffers[0], showOldPrice: false }] })).toEqual({ price: 8, oldPrice: undefined });
  });
  it('keeps the base price when the discount requires an order threshold', () => {
    expect(getProductCampaignPrice({ ...product, campaignOffers: [{ ...product.campaignOffers[0], minOrderAmount: 100 }] }).price).toBe(10);
  });
});
