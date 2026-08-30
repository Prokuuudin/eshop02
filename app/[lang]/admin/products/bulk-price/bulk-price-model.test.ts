import { describe, expect, it } from 'vitest';
import { calcNewPrice, describeChange, mapWithConcurrency } from './bulk-price-model';

const l = (_ru: string, en: string) => en;

describe('bulk price helpers', () => {
    it('calculates percentage, additive and fixed prices with cent rounding', () => {
        expect(calcNewPrice(19.99, 'percent', -10)).toBe(17.99);
        expect(calcNewPrice(19.99, 'fixed_add', 2.01)).toBe(22);
        expect(calcNewPrice(19.99, 'fixed_set', 7.5)).toBe(7.5);
    });

    it('never returns a negative price', () => {
        expect(calcNewPrice(10, 'percent', -200)).toBe(0);
        expect(calcNewPrice(10, 'fixed_add', -20)).toBe(0);
        expect(calcNewPrice(10, 'fixed_set', -1)).toBe(0);
    });

    it('describes a clear-old-price-only operation', () => {
        expect(describeChange('percent', Number.NaN, 'clear', 'en-US', l)).toBe('Remove crossed-out price');
    });

    it('preserves input order when work completes out of order', async () => {
        const result = await mapWithConcurrency([3, 1, 2], async (value) => {
            await Promise.resolve();
            return value * 2;
        });
        expect(result).toEqual([6, 2, 4]);
    });
});
