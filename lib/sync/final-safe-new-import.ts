import { createHash } from 'node:crypto';
import { allowedStock } from './second-new-product-audit';
export const FINAL_SAFE_XML_SHA =
    '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad';
export const FINAL_SAFE_ALLOWLIST_SHA =
    '82348468a7bcd2980b91f3de2b15416589670bcfe5e9bcb290a22d10920c0804';
export const FINAL_SAFE_BASELINE = {
    productCount: 17422,
    externalIdCount: 14632,
    unlinkedCount: 2790,
    active: 2229,
    inactive: 15193,
    syncRunCount: 11,
    duplicateExternalId: 0,
    fingerprint: 'ee43adf3270406851c72012bd13442ae',
} as const;
export type Entry = {
    plannedProductId: string;
    xmlSku: string;
    externalId: string;
    sku: string;
    barcode: string | null;
    sourceTitle: string;
    productTitle: string;
    prices: { price1: string; price2: string; price3: string; price4: string };
    price: string;
    warehouseQuantities: Record<string, number>;
    allowedStock: number;
    expected: {
        brand: '';
        category: 'uncategorized';
        titleEn: null;
        titleLv: null;
        description: null;
        image: null;
        images: [];
        isActive: false;
    };
    identityEvidence: string[];
};
export type Allowlist = {
    schemaVersion: 1;
    wave: 'final-safe-new-product-import';
    executable: true;
    authorizedForApply: true;
    entryCount: number;
    baseline: typeof FINAL_SAFE_BASELINE;
    xml: { records: 16176; uniqueSku: 16176; sha256: string };
    entries: Entry[];
};
export type Identity = {
    id: string;
    externalId: string | null;
    sku: string | null;
    barcode: string | null;
};
export const sha256 = (v: string | Buffer): string => createHash('sha256').update(v).digest('hex');
export function assertBaseline(v: Record<string, unknown>): void {
    for (const [k, x] of Object.entries(FINAL_SAFE_BASELINE))
        if (v[k] !== x) throw new Error(`FINAL_SAFE_NEW_BASELINE_DRIFT:${JSON.stringify(v)}`);
}
export function parseAllowlist(
    content: string | Buffer,
    expected = FINAL_SAFE_ALLOWLIST_SHA
): Allowlist {
    if (sha256(content) !== expected) throw new Error('FINAL_SAFE_NEW_ALLOWLIST_SHA_DRIFT');
    const a = JSON.parse(content.toString()) as Allowlist;
    if (
        !a.executable ||
        !a.authorizedForApply ||
        a.wave !== 'final-safe-new-product-import' ||
        a.entryCount !== a.entries.length ||
        a.xml.sha256 !== FINAL_SAFE_XML_SHA ||
        JSON.stringify(a.baseline) !== JSON.stringify(FINAL_SAFE_BASELINE)
    )
        throw new Error('FINAL_SAFE_NEW_ALLOWLIST_BINDING');
    for (const values of [
        a.entries.map((e) => e.plannedProductId),
        a.entries.map((e) => e.externalId),
        a.entries.map((e) => e.sku),
    ])
        if (new Set(values).size !== a.entries.length)
            throw new Error('FINAL_SAFE_NEW_DUPLICATE_ALLOWLIST');
    return a;
}
export function validateEntry(e: Entry): void {
    if (!e.xmlSku || e.externalId !== e.xmlSku || e.sku !== e.xmlSku || e.productTitle !== e.xmlSku)
        throw new Error('FINAL_SAFE_NEW_IDENTITY');
    if (
        !/^\d+(?:\.\d{2})$/u.test(e.price) ||
        !Number.isFinite(Number(e.price)) ||
        Number(e.price) < 0
    )
        throw new Error('FINAL_SAFE_NEW_PRICE');
    if (e.allowedStock !== allowedStock(e.warehouseQuantities))
        throw new Error('FINAL_SAFE_NEW_STOCK');
    if (
        e.expected.isActive !== false ||
        e.expected.brand !== '' ||
        e.expected.category !== 'uncategorized'
    )
        throw new Error('FINAL_SAFE_NEW_PUBLICATION');
}
export function preparePlan(
    a: Allowlist,
    existing: Identity[]
): {
    insertable: Entry[];
    metrics: {
        candidates: number;
        wouldInsert: number;
        alreadyImported: number;
        conflicts: number;
        skipped: number;
        productUpdates: 0;
        deactivations: 0;
        databaseWrites: 0;
        predictedErpRecords: number;
        insertedInactive: number;
        insertedActive: 0;
    };
} {
    const ids = new Set(existing.map((p) => p.id)),
        ext = new Set(existing.flatMap((p) => (p.externalId ? [p.externalId] : []))),
        sku = new Set(existing.flatMap((p) => (p.sku ? [p.sku] : []))),
        ean = new Set(existing.flatMap((p) => (p.barcode ? [p.barcode] : [])));
    let alreadyImported = 0,
        conflicts = 0;
    const insertable: Entry[] = [];
    for (const e of a.entries) {
        try {
            validateEntry(e);
        } catch {
            conflicts++;
            continue;
        }
        if (
            existing.some(
                (p) =>
                    p.id === e.plannedProductId &&
                    p.externalId === e.externalId &&
                    p.sku === e.sku &&
                    p.barcode === e.barcode
            )
        ) {
            alreadyImported++;
            continue;
        }
        if (
            ids.has(e.plannedProductId) ||
            ext.has(e.externalId) ||
            sku.has(e.sku) ||
            (e.barcode !== null && ean.has(e.barcode))
        ) {
            conflicts++;
            continue;
        }
        insertable.push(e);
    }
    return {
        insertable,
        metrics: {
            candidates: a.entries.length,
            wouldInsert: insertable.length,
            alreadyImported,
            conflicts,
            skipped: a.entries.length - insertable.length - alreadyImported,
            productUpdates: 0,
            deactivations: 0,
            databaseWrites: 0,
            predictedErpRecords: insertable.length,
            insertedInactive: insertable.length,
            insertedActive: 0,
        },
    };
}
