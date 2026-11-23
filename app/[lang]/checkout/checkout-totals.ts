import type { DeliveryMethod } from '@/lib/orders-store';
import { calcEarnedPointsForPayment, eurosToPoints, pointsToEuros, type BonusLineItem, type PaymentEarnConfig } from '@/lib/bonus-program';
import { calcDeliveryFee } from '@/lib/delivery';
import { extractVat } from '@/lib/tax';

type CheckoutTotalsInput = {
    subtotal: number;
    appliedPromo: string | undefined;
    appliedPromoDiscountPct: number | null;
    campaignDiscount: number;
    freeShipping: boolean;
    country?: import('@/lib/delivery').DeliveryCountry;
    shippingSettings?: import('@/lib/commerce-settings').CommerceSettings;
    deliveryMethod: DeliveryMethod;
    bonusApplicable: boolean;
    bonusApplied: boolean;
    bonusBalance: number;
    maxBonusSpendPercent: number;
    bonusToEarn: number;
    /** Lines and program settings for the forecast; points are credited only after payment. */
    earnItems: BonusLineItem[];
    earnConfig: PaymentEarnConfig;
};

export function calculateCheckoutTotals(input: CheckoutTotalsInput): {
    discount: number;
    subtotalAfterDiscount: number;
    deliveryFee: number;
    taxAmount: number;
    grandTotal: number;
    maxBonusSpendPoints: number;
    maxBonusDiscount: number;
    bonusSpentPoints: number;
    bonusDiscount: number;
    finalGrandTotal: number;
    adjustedBonusToEarn: number;
} {
    const promoDiscount = input.appliedPromo && input.appliedPromoDiscountPct !== null
        ? input.appliedPromoDiscountPct
        : 0;
    const discount = Math.max(promoDiscount, input.campaignDiscount);
    const subtotalAfterDiscount = input.subtotal - discount;
    const deliveryFee = input.freeShipping
        ? 0
        : calcDeliveryFee(input.deliveryMethod, subtotalAfterDiscount, input.country, input.shippingSettings);
    const taxAmount = extractVat(subtotalAfterDiscount);
    const grandTotal = subtotalAfterDiscount + deliveryFee;
    const maxBonusSpendPoints = input.bonusApplicable
        ? Math.min(input.bonusBalance, eurosToPoints((grandTotal * input.maxBonusSpendPercent) / 100))
        : 0;
    const maxBonusDiscount = pointsToEuros(maxBonusSpendPoints);
    const bonusSpentPoints = input.bonusApplied ? maxBonusSpendPoints : 0;
    const bonusDiscount = pointsToEuros(bonusSpentPoints);
    const finalGrandTotal = grandTotal - bonusDiscount;
    // Same formula the server uses when the payment is confirmed: goods actually paid
    // after promo/campaign discount and spent bonuses, delivery excluded, floored.
    const adjustedBonusToEarn = calcEarnedPointsForPayment({
        items: input.earnItems,
        goodsSubtotal: input.subtotal,
        total: finalGrandTotal,
        delivery: deliveryFee,
        config: input.earnConfig,
    });

    return {
        discount,
        subtotalAfterDiscount,
        deliveryFee,
        taxAmount,
        grandTotal,
        maxBonusSpendPoints,
        maxBonusDiscount,
        bonusSpentPoints,
        bonusDiscount,
        finalGrandTotal,
        adjustedBonusToEarn,
    };
}
