import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    FINAL_SAFE_ALLOWLIST_SHA,
    FINAL_SAFE_BASELINE,
    assertBaseline,
    parseAllowlist,
    preparePlan,
    sha256,
    validateEntry,
    type Identity,
} from './final-safe-new-import';
const content = readFileSync('final-safe-new-product-import-allowlist.json'),
    a = parseAllowlist(content),
    entry = a.entries[0],
    barcodeEntry = a.entries.find((candidate) => candidate.barcode !== null)!;
describe('final SAFE_NEW import contract', () => {
    it('binds immutable allowlist SHA', () =>
        expect(sha256(content)).toBe(FINAL_SAFE_ALLOWLIST_SHA));
    it('rejects baseline drift', () =>
        expect(() => assertBaseline({ ...FINAL_SAFE_BASELINE, productCount: 1 })).toThrow(
            'BASELINE_DRIFT'
        ));
    it('rejects allowlist SHA drift', () =>
        expect(() => parseAllowlist(Buffer.concat([content, Buffer.from(' ')]))).toThrow(
            'ALLOWLIST_SHA_DRIFT'
        ));
    it('rejects malformed price', () =>
        expect(() => validateEntry({ ...entry, price: 'NaN' })).toThrow('PRICE'));
    it('enforces allowed warehouse stock formula', () =>
        expect(() => validateEntry({ ...entry, allowedStock: entry.allowedStock + 1 })).toThrow(
            'STOCK'
        ));
    it('enforces inactive-only insertion', () =>
        expect(() =>
            validateEntry({ ...entry, expected: { ...entry.expected, isActive: true as false } })
        ).toThrow('PUBLICATION'));
    it.each(['externalId', 'sku', 'barcode'] as const)('rejects existing %s claimant', (key) => {
        const candidate = key === 'barcode' ? barcodeEntry : entry,
            p = {
                id: 'other',
                externalId: null,
                sku: null,
                barcode: null,
                ...{ [key]: candidate[key] },
            } as Identity;
        expect(preparePlan(a, [p]).metrics.conflicts).toBeGreaterThan(0);
    });
    it('is idempotent after exact import', () => {
        const existing = a.entries.map((e) => ({
            id: e.plannedProductId,
            externalId: e.externalId,
            sku: e.sku,
            barcode: e.barcode,
        }));
        expect(preparePlan(a, existing).metrics).toMatchObject({
            wouldInsert: 0,
            alreadyImported: a.entryCount,
            conflicts: 0,
            productUpdates: 0,
            deactivations: 0,
            databaseWrites: 0,
        });
    });
});
