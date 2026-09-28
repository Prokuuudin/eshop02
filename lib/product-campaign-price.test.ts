import { describe, expect, it } from 'vitest';
import { getProductCampaignPrice, getValidOldPrice } from './product-campaign-price';

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
  it('drops an oldPrice that is not above the price when no campaign applies', () => {
    expect(getProductCampaignPrice({ price: 7.3, oldPrice: 6.6 })).toEqual({ price: 7.3, oldPrice: undefined });
    expect(getProductCampaignPrice({ price: 7.3, oldPrice: 7.3 })).toEqual({ price: 7.3, oldPrice: undefined });
    expect(getProductCampaignPrice({ price: 6.5, oldPrice: 10 })).toEqual({ price: 6.5, oldPrice: 10 });
  });
  it('computes a Hairshop-Pro campaign from the current base price, ignoring a stored oldPrice', () => {
    expect(getProductCampaignPrice({ price: 7.5, oldPrice: 12, campaignOffers: [{ id: 'pro', discountPercent: 10, minOrderAmount: 0 }] }))
      .toEqual({ price: 6.75, oldPrice: 7.5 });
  });
});

describe('getValidOldPrice', () => {
  it('returns oldPrice only when strictly above a finite price', () => {
    expect(getValidOldPrice(6.5, 10)).toBe(10);
    expect(getValidOldPrice(7.3, 7.3)).toBeUndefined();
    expect(getValidOldPrice(7.3, 6.6)).toBeUndefined();
    expect(getValidOldPrice(7.3, null)).toBeUndefined();
    expect(getValidOldPrice(7.3, undefined)).toBeUndefined();
    expect(getValidOldPrice(Number.NaN, 10)).toBeUndefined();
    expect(getValidOldPrice(7.3, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
