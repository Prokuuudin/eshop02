import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    applySixthAtomic,
    assertSixthBaseline,
    assertSixthPostBackfillBaseline,
    assertSixthPostSyncBaseline,
    SIXTH_WAVE_ALLOWLIST_SHA,
    SIXTH_WAVE_XML_SHA,
    validateSixth,
    type SixthAllowlist,
    type SixthProduct,
} from './sixth-wave';
import { prepareSixthPlan } from './controlled-sixth-wave';
const content = readFileSync('sixth-wave-allowlist.json'),
    xml = readFileSync('export.xml', 'utf8'),
    a = JSON.parse(content.toString()) as SixthAllowlist;
const products = (): SixthProduct[] =>
    a.entries.map((e) => ({
        id: e.productId,
        sku: e.productSku,
        barcode: e.productBarcode,
        externalId: null,
        title: e.baseline.title,
        titleEn: e.baseline.titleEn,
        titleLv: e.baseline.titleLv,
        brand: e.baseline.brand,
        category: e.baseline.category,
        description: e.baseline.description,
        technicalSpecs: e.baseline.technicalSpecs,
        specVolume: e.baseline.specVolume,
        specType: e.baseline.specType,
        image: e.baseline.image,
        images: e.baseline.images,
        isActive: e.baseline.isActive,
        isDeleted: e.baseline.isDeleted,
        price: e.baseline.price,
        stock: e.baseline.stock,
        createdAt: new Date(e.baseline.createdAt),
    }));
const policy = { allowlistSha: SIXTH_WAVE_ALLOWLIST_SHA, xmlSha: SIXTH_WAVE_XML_SHA };
describe('sixth-wave immutable gates', () => {
    it('accepts only immutable SAFE scope', () =>
        expect(validateSixth(content, xml, products()).entries).toHaveLength(30));
    it('rejects XML SHA drift', () =>
        expect(() => validateSixth(content, xml + ' ', products())).toThrow('XML_SHA'));
    it('rejects allowlist SHA drift', () =>
        expect(() =>
            validateSixth(Buffer.concat([content, Buffer.from(' ')]), xml, products())
        ).toThrow('ALLOWLIST_SHA'));
    it('rejects baseline drift', () =>
        expect(() => assertSixthBaseline({ ...a.baseline, externalIdCount: 1 })).toThrow(
            'BASELINE_DRIFT'
        ));
    it('accepts only the exact post-backfill state', () => {
        expect(() =>
            assertSixthPostBackfillBaseline({
                productCount: 6378,
                externalIdCount: 3580,
                unlinkedCount: 2798,
                active: 2229,
                inactive: 4149,
                syncRunCount: 7,
                fingerprint: 'b742ad7ca74fdaab4de12af09651b211',
            })
        ).not.toThrow();
    });
    it('accepts only the exact post-sync state', () => {
        expect(() =>
            assertSixthPostSyncBaseline({
                productCount: 6378,
                externalIdCount: 3580,
                unlinkedCount: 2798,
                active: 2229,
                inactive: 4149,
                syncRunCount: 8,
                fingerprint: '4d9c28b1184c337e4565beef472379b5',
            })
        ).not.toThrow();
    });
    it('rejects missing Product', () =>
        expect(() => validateSixth(content, xml, products().slice(1))).toThrow('missing Product'));
    it('rejects filled externalId', () => {
        const p = products();
        p[0].externalId = 'claimed';
        expect(() => validateSixth(content, xml, p)).toThrow('externalId gate');
    });
    it('rejects claimant conflict', () => {
        const p = products();
        p.push({ ...p[0], id: 'other', externalId: a.entries[0].xmlSku });
        expect(() => validateSixth(content, xml, p)).toThrow('externalId claimant');
    });
    it('rejects EAN uniqueness drift', () => {
        const e = a.entries.find((e) => e.matchType === 'UNIQUE_EAN')!;
        const p = products();
        p.push({ ...p[0], id: 'other', barcode: e.xmlEan });
        expect(() => validateSixth(content, xml, p)).toThrow('EAN uniqueness drift');
    });
    it('rejects Product identity drift', () => {
        const p = products();
        p[0].sku = 'changed';
        expect(() => validateSixth(content, xml, p)).toThrow('source identity drift');
    });
    it('rejects soft-deleted Product', () => {
        const p = products();
        p[0].isDeleted = true;
        expect(() => validateSixth(content, xml, p)).toThrow('soft-deleted');
    });
    it('rejects protected baseline drift', () => {
        const p = products();
        p[0].title += ' changed';
        expect(() => validateSixth(content, xml, p)).toThrow('protected baseline drift');
    });
    it('rejects manual/deferred intersection', () => {
        const value = JSON.parse(content.toString()) as SixthAllowlist;
        value.entries[0].productId = '19015';
        const data = Buffer.from(JSON.stringify(value));
        const p = products();
        p[0].id = '19015';
        expect(() =>
            validateSixth(data, xml, p, 'pre-backfill', { ...policy, allowlistSha: undefined })
        ).toThrow();
    });
});
describe('sixth-wave atomic contract', () => {
    it('rolls back affected-row mismatch', async () => {
        let committed = false;
        const store = {
            transaction: async <T>(
                fn: (tx: {
                    loadAll: () => Promise<SixthProduct[]>;
                    updateExternalIds: () => Promise<number>;
                }) => Promise<T>
            ) => {
                try {
                    const r = await fn({
                        loadAll: async () => products(),
                        updateExternalIds: async () => 29,
                    });
                    committed = true;
                    return r;
                } catch (e) {
                    committed = false;
                    throw e;
                }
            },
        };
        await expect(applySixthAtomic(store, content, xml)).rejects.toThrow(
            'ATOMIC_UPDATE_COUNT_MISMATCH'
        );
        expect(committed).toBe(false);
    });
});
describe('sixth-wave controlled preview', () => {
    it('preserves zero price, uses allowed warehouses and forbids inserts/deactivation', async () => {
        const feed = a.entries.map((e, i) => ({
                externalId: e.xmlSku,
                title: e.xmlSku,
                price: i ? 10 : 0,
                stock: 6,
                prices: { price1: 99, price2: i ? 10 : 0, price3: 88, price4: 77 },
                warehouseQuantities: {
                    '10000': 1,
                    '10001': 2,
                    '10002': 3,
                    '10005': 0,
                    '10003': 999,
                },
            })),
            db = {
                product: {
                    findMany: async () =>
                        products().map((p) => ({
                            id: p.id,
                            sku: p.sku,
                            externalId: a.entries.find((e) => e.productId === p.id)!.xmlSku,
                            price: p.price,
                            stock: p.stock,
                            isDeleted: p.isDeleted,
                        })),
                },
                keyValueSetting: { findUnique: async () => null },
            };
        const plan = await prepareSixthPlan(db as never, a, feed);
        expect(plan.rows[0].price).toBe(a.entries[0].baseline.price);
        expect(plan.rows[0].stock).toBe(6);
        expect(plan.metrics).toMatchObject({
            inserts: 0,
            deactivations: 0,
            outsideScopeChanges: 0,
            zeroPriceRegressions: 0,
            stockFormulaMismatches: 0,
        });
    });
});
