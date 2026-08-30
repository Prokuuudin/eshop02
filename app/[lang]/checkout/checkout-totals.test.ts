import { describe, expect, it } from 'vitest';
import { calculateCheckoutTotals } from './checkout-totals';

const base = {
    subtotal: 100,
    appliedPromo: undefined,
    appliedPromoDiscountPct: null,
    campaignDiscount: 0,
    freeShipping: true,
    deliveryMethod: 'courier' as const,
    bonusApplicable: false,
    bonusApplied: false,
    bonusBalance: 0,
    maxBonusSpendPercent: 20,
    bonusToEarn: 100,
};

describe('calculateCheckoutTotals', () => {
    it('uses the larger campaign discount and honors free shipping', () => {
        const totals = calculateCheckoutTotals({
            ...base,
            appliedPromo: 'SAVE10',
            appliedPromoDiscountPct: 10,
            campaignDiscount: 15,
        });

        expect(totals.discount).toBe(15);
        expect(totals.subtotalAfterDiscount).toBe(85);
        expect(totals.deliveryFee).toBe(0);
        expect(totals.finalGrandTotal).toBe(85);
    });

    it('caps bonus spending by balance and adjusts earned points', () => {
        const totals = calculateCheckoutTotals({
            ...base,
            bonusApplicable: true,
            bonusApplied: true,
            bonusBalance: 500,
        });

        expect(totals.bonusSpentPoints).toBe(500);
        expect(totals.bonusDiscount).toBe(5);
        expect(totals.finalGrandTotal).toBe(95);
        expect(totals.adjustedBonusToEarn).toBe(95);
    });
});
