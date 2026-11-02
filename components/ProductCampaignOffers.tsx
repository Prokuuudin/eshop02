'use client';

import React from 'react';
import type { Product } from '@/data/products';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function ProductCampaignOffers({ product }: { product: Product }): React.ReactElement | null {
  const { language } = useTranslation();
  const offers = product.campaignOffers ?? [];
  const secondItemOffers = product.secondItemOffers ?? [];
  if (!offers.length && !secondItemOffers.length) return null;
  const text = {
    ru: { minimum: 'при заказе от', secondItem: '2-й товар' },
    en: { minimum: 'on orders from', secondItem: '2nd item' },
    lv: { minimum: 'pasūtījumiem no', secondItem: '2. prece' },
  }[language];
  return (
    <div className="product-campaign-offers mt-2 space-y-1 text-xs text-red-700 dark:text-red-400">
      {offers.map((offer) => (
        <div key={offer.id}>
          <Badge className="bg-red-600 text-white">−{offer.discountPercent}%</Badge>
          {offer.name && <span className="ml-1">{offer.name}</span>}
          {offer.minOrderAmount > 0 && ` ${text.minimum} ${formatEuro(offer.minOrderAmount, getLocaleFromLanguage(language))}`}
        </div>
      ))}
      {secondItemOffers.map((offer) => (
        <div key={offer.id} className="product-campaign-offers__second-item">
          <Badge className="bg-red-600 text-white">{text.secondItem} −{offer.discountPercent}%</Badge>
          {offer.name && <span className="ml-1">{offer.name}</span>}
          {offer.minOrderAmount > 0 && ` ${text.minimum} ${formatEuro(offer.minOrderAmount, getLocaleFromLanguage(language))}`}
        </div>
      ))}
    </div>
  );
}
