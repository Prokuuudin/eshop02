'use client';

import React from 'react';
import type { Product } from '@/data/products';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';

export default function ProductCampaignOffers({ product }: { product: Product }): React.ReactElement | null {
  const { language } = useTranslation();
  const offers = product.campaignOffers;
  if (!offers?.length) return null;
  const text = {
    ru: { discount: 'Скидка', cart: 'в корзине', minimum: 'при заказе от' },
    en: { discount: 'Discount', cart: 'in cart', minimum: 'on orders from' },
    lv: { discount: 'Atlaide', cart: 'grozā', minimum: 'pasūtījumiem no' },
  }[language];
  return (
    <div className="product-campaign-offers mt-2 space-y-1 text-xs text-red-700 dark:text-red-400">
      {offers.map((offer) => (
        <p key={offer.id}>
          <strong>{text.discount} {offer.discountPercent}%</strong> {text.cart}
          {offer.minOrderAmount > 0 && ` ${text.minimum} ${formatEuro(offer.minOrderAmount, getLocaleFromLanguage(language))}`}
        </p>
      ))}
    </div>
  );
}
