type CheckoutPromoItem = {
    id: string;
    quantity: number;
    selectedVariants?: Array<{ groupName: string; value: string }>;
};

/** What a pricing preview needs from a cart line: the product, quantity and chosen options, never a price. */
export function toPricingLine(item: CheckoutPromoItem): CheckoutPromoItem {
    return {
        id: item.id,
        quantity: item.quantity,
        ...(item.selectedVariants?.length
            ? { selectedVariants: item.selectedVariants.map(({ groupName, value }) => ({ groupName, value })) }
            : {}),
    };
}

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
