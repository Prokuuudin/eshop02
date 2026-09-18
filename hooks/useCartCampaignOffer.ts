'use client';

import { useEffect, useState } from 'react';
import { evaluateCampaignOffer, type CampaignOffer } from '@/app/[lang]/checkout/checkout-promo-api';

const EMPTY_OFFER: CampaignOffer = { discount: 0, freeShipping: false };

export function useCartCampaignOffer(items: Array<{ id: string; quantity: number }>, enabled = true): CampaignOffer {
    const signature = JSON.stringify(items.map(({ id, quantity }) => ({ id, quantity })));
    const [result, setResult] = useState<{ signature: string; offer: CampaignOffer } | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        void evaluateCampaignOffer(JSON.parse(signature), controller.signal)
            .then((offer) => {
                if (!controller.signal.aborted) setResult({ signature, offer: offer ?? EMPTY_OFFER });
            })
            .catch(() => {
                if (!controller.signal.aborted) setResult({ signature, offer: EMPTY_OFFER });
            });
        return () => controller.abort();
    }, [signature, enabled]);

    return enabled && result?.signature === signature ? result.offer : EMPTY_OFFER;
}
