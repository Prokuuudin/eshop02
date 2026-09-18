import type { Product } from '@/data/products';

// Display the offer without changing the catalog price used for checkout.
export function getProductCampaignPrice(product: Pick<Product, 'price' | 'oldPrice' | 'campaignOffers'>): { price: number; oldPrice?: number } {
  const offer = product.campaignOffers?.find((item) => item.minOrderAmount <= 0);
  if (!offer || !Number.isFinite(product.price)) return { price: product.price, oldPrice: product.oldPrice };
  return {
    price: Math.round(product.price * (1 - offer.discountPercent / 100) * 100) / 100,
    oldPrice: offer.showOldPrice !== false ? product.price : undefined,
  };
}
