type CheckoutPromoItem = {
    id: string;
    quantity: number;
};

export type CampaignOffer = {
    discount: number;
    freeShipping: boolean;
    campaignName?: string;
};

export type PromoValidation = {
    valid: boolean;
    discount?: number;
    code?: string;
};

export async function evaluateCampaignOffer(
    items: CheckoutPromoItem[],
    signal?: AbortSignal
): Promise<CampaignOffer | null> {
    const response = await fetch('/api/promo/campaigns/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        signal,
    });
    if (!response.ok) return null;

    const result = await response.json() as Partial<CampaignOffer>;
    return {
        discount: Math.max(0, Number(result.discount) || 0),
        freeShipping: result.freeShipping === true,
        campaignName: result.campaignName,
    };
}

export async function validatePromoCode(input: {
    code: string;
    email: string;
    items: CheckoutPromoItem[];
}): Promise<PromoValidation> {
    const response = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    return response.json() as Promise<PromoValidation>;
}
