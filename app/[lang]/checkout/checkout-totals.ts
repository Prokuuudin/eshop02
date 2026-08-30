import type { DeliveryMethod } from '@/lib/orders-store';
import { eurosToPoints, pointsToEuros } from '@/lib/bonus-program';
import { calcDeliveryFee } from '@/lib/delivery';
import { extractVat } from '@/lib/tax';

type CheckoutTotalsInput = {
    subtotal: number;
    appliedPromo: string | undefined;
    appliedPromoDiscountPct: number | null;
    campaignDiscount: number;
    freeShipping: boolean;
    deliveryMethod: DeliveryMethod;
    bonusApplicable: boolean;
    bonusApplied: boolean;
    bonusBalance: number;
    maxBonusSpendPercent: number;
    bonusToEarn: number;
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
        : calcDeliveryFee(input.deliveryMethod, subtotalAfterDiscount);
    const taxAmount = extractVat(subtotalAfterDiscount);
    const grandTotal = subtotalAfterDiscount + deliveryFee;
    const maxBonusSpendPoints = input.bonusApplicable
        ? Math.min(input.bonusBalance, eurosToPoints((grandTotal * input.maxBonusSpendPercent) / 100))
        : 0;
    const maxBonusDiscount = pointsToEuros(maxBonusSpendPoints);
    const bonusSpentPoints = input.bonusApplied ? maxBonusSpendPoints : 0;
    const bonusDiscount = pointsToEuros(bonusSpentPoints);
    const finalGrandTotal = grandTotal - bonusDiscount;
    const adjustedBonusToEarn = grandTotal > 0 && input.bonusApplied
        ? Math.round((input.bonusToEarn * finalGrandTotal) / grandTotal)
        : input.bonusToEarn;

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
