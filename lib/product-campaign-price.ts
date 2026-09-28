import type { Product } from '@/data/products';

// A strike-through "old price" only means a discount when it is strictly above the
// current base price. Shared by storefront rendering and server promo eligibility so
// both agree on what a sale item is.
export function getValidOldPrice(price: number, oldPrice: number | null | undefined): number | undefined {
  if (typeof oldPrice !== 'number' || !Number.isFinite(oldPrice) || !Number.isFinite(price)) return undefined;
  return oldPrice > price ? oldPrice : undefined;
}

// Display the offer without changing the catalog price used for checkout.
export function getProductCampaignPrice(product: Pick<Product, 'price' | 'oldPrice' | 'campaignOffers'>): { price: number; oldPrice?: number } {
  const offer = product.campaignOffers?.find((item) => item.minOrderAmount <= 0);
  if (!offer || !Number.isFinite(product.price)) return { price: product.price, oldPrice: getValidOldPrice(product.price, product.oldPrice) };
  return {
    price: Math.round(product.price * (1 - offer.discountPercent / 100) * 100) / 100,
    oldPrice: offer.showOldPrice !== false ? product.price : undefined,
  };
}
