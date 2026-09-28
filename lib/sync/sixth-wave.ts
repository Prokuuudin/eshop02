/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

export const SIXTH_WAVE_XML_SHA =
    '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad';
export const SIXTH_WAVE_BASELINE_FINGERPRINT = 'f1890a064654d64b6fb295cbeaa01bae';
export const SIXTH_WAVE_ALLOWLIST_SHA = 'fbacc8f303e4632d50a97112db614a5fced236e8bacb5b34043f6cfa4ca34f09';
export const SIXTH_WAVE_EXCLUDED_IDS = new Set([
    '21352',
    '21623',
    '19018',
    '21283',
    '21624',
    '22129',
    '21420',
    '19015',
    '18427',
    '20469',
]);
export type SixthEntry = {
    productId: string;
    productSku: string | null;
    productBarcode: string | null;
    xmlSku: string;
    xmlEan: string;
    externalIdToSet: string;
    matchType: 'UNIQUE_EAN' | 'COMPOUND_STRONG';
    identityEvidence: Record<string, unknown>;
    baseline: {
        externalId: null;
        sku: string | null;
        barcode: string | null;
        title: string;
        titleEn: string | null;
        titleLv: string | null;
        brand: string;
        category: string;
        description: string;
        technicalSpecs: unknown;
        specVolume: string | null;
        specType: string | null;
        image: string;
        images: string[];
        isActive: boolean;
        isDeleted: boolean;
        price: number;
        stock: number;
        createdAt: string;
    };
};
export type SixthAllowlist = {
    schemaVersion: 1;
    wave: 'sixth-wave-strict-identity';
    executable: true;
    entryCount: number;
    baseline: {
        productCount: 6378;
        externalIdCount: 3550;
        unlinkedCount: 2828;
        active: 2229;
        inactive: 4149;
        syncRunCount: 7;
        fingerprint: string;
    };
    xmlSha256: string;
    entries: SixthEntry[];
};
export type SixthProduct = {
    id: string;
    sku: string | null;
    barcode: string | null;
    externalId: string | null;
    title: string;
    titleEn?: string | null;
    titleLv?: string | null;
    brand: string;
    category: string;
    description?: string | null;
    technicalSpecs?: unknown;
    specVolume?: string | null;
    specType?: string | null;
    image?: string | null;
    images?: string[];
    isActive: boolean;
    isDeleted: boolean;
    price?: unknown;
    stock?: number;
    createdAt?: Date;
};
type XmlIdentity = { sku: string; ean: string; name: string };
const parser = new XMLParser({
    parseTagValue: false,
    processEntities: false,
    isArray: (n) => n === 'item',
});
const xmlRows = (xml: string): XmlIdentity[] =>
    (
        (
            parser.parse(xml) as {
                root?: { item?: Array<{ sku?: string; code?: string; title?: string }> };
            }
        ).root?.item ?? []
    ).map((x) => ({
        sku: String(x.sku ?? '').trim(),
        ean: String(x.code ?? '').trim(),
        name: String(x.title ?? '').trim(),
    }));
export const sixthSha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
export function assertSixthBaseline(v: {
    productCount: number;
    externalIdCount: number;
    unlinkedCount: number;
    active: number;
    inactive: number;
    syncRunCount: number;
    fingerprint: string;
}) {
    if (
        v.productCount !== 6378 ||
        v.externalIdCount !== 3550 ||
        v.unlinkedCount !== 2828 ||
        v.active !== 2229 ||
        v.inactive !== 4149 ||
        v.syncRunCount !== 7 ||
        v.fingerprint !== SIXTH_WAVE_BASELINE_FINGERPRINT
    )
        throw new Error(`SIXTH_WAVE_BASELINE_DRIFT:${JSON.stringify(v)}`);
}
export function assertSixthPostBackfillBaseline(v: {
    productCount: number;
    externalIdCount: number;
    unlinkedCount: number;
    active: number;
    inactive: number;
    syncRunCount: number;
    fingerprint: string;
}) {
    if (
        v.productCount !== 6378 ||
        v.externalIdCount !== 3580 ||
        v.unlinkedCount !== 2798 ||
        v.active !== 2229 ||
        v.inactive !== 4149 ||
        v.syncRunCount !== 7 ||
        v.fingerprint !== 'b742ad7ca74fdaab4de12af09651b211'
    )
        throw new Error(`SIXTH_WAVE_POST_BACKFILL_DRIFT:${JSON.stringify(v)}`);
}
export function assertSixthPostSyncBaseline(v: {
    productCount: number;
    externalIdCount: number;
    unlinkedCount: number;
    active: number;
    inactive: number;
    syncRunCount: number;
    fingerprint: string;
}) {
    if (
        v.productCount !== 6378 ||
        v.externalIdCount !== 3580 ||
        v.unlinkedCount !== 2798 ||
        v.active !== 2229 ||
        v.inactive !== 4149 ||
        v.syncRunCount !== 8 ||
        v.fingerprint !== '4d9c28b1184c337e4565beef472379b5'
    )
        throw new Error(`SIXTH_WAVE_POST_SYNC_DRIFT:${JSON.stringify(v)}`);
}
export function parseSixthAllowlist(
    content: string | Buffer,
    expected = SIXTH_WAVE_ALLOWLIST_SHA
): SixthAllowlist {
    if (expected === 'TO_BE_BOUND' || sixthSha(content) !== expected)
        throw new Error('SIXTH_WAVE_ALLOWLIST_SHA_MISMATCH');
    return JSON.parse(content.toString()) as SixthAllowlist;
}
export function validateSixth(
    content: string | Buffer,
    xml: string,
    products: SixthProduct[],
    phase: 'pre-backfill' | 'post-backfill' | 'post-sync' = 'pre-backfill',
    policy: { allowlistSha?: string; xmlSha?: string } = {}
): SixthAllowlist {
    if (sixthSha(xml) !== (policy.xmlSha ?? SIXTH_WAVE_XML_SHA))
        throw new Error('SIXTH_WAVE_XML_SHA_MISMATCH');
    const a = parseSixthAllowlist(content, policy.allowlistSha),
        errors: string[] = [];
    if (
        !a.executable ||
        a.wave !== 'sixth-wave-strict-identity' ||
        a.entryCount !== a.entries.length ||
        !a.entries.length
    )
        errors.push('metadata mismatch');
    if (
        a.baseline.fingerprint !== SIXTH_WAVE_BASELINE_FINGERPRINT ||
        a.xmlSha256 !== SIXTH_WAVE_XML_SHA
    )
        errors.push('binding mismatch');
    for (const values of [
        a.entries.map((e) => e.productId),
        a.entries.map((e) => e.xmlSku),
        a.entries.map((e) => e.externalIdToSet),
    ])
        if (new Set(values).size !== a.entries.length) errors.push('allowlist collision');
    const xr = xmlRows(xml),
        byId = new Map(products.map((p) => [p.id, p])),
        external = new Map(products.filter((p) => p.externalId).map((p) => [p.externalId!, p.id])),
        eanProducts = new Map<string, SixthProduct[]>();
    for (const p of products)
        if (p.barcode) eanProducts.set(p.barcode, [...(eanProducts.get(p.barcode) ?? []), p]);
    for (const e of a.entries) {
        const p = byId.get(e.productId),
            xs = xr.filter((x) => x.sku === e.xmlSku),
            xe = xr.filter((x) => x.ean && x.ean === e.xmlEan);
        if (!p) {
            errors.push(`missing Product ${e.productId}`);
            continue;
        }
        if (SIXTH_WAVE_EXCLUDED_IDS.has(e.productId))
            errors.push(`manual/deferred intersection ${e.productId}`);
        if (p.isDeleted) errors.push(`soft-deleted ${e.productId}`);
        if (p.externalId !== (phase === 'pre-backfill' ? null : e.externalIdToSet))
            errors.push(`externalId gate ${e.productId}`);
        if (p.sku !== e.productSku || p.barcode !== e.productBarcode)
            errors.push(`source identity drift ${e.productId}`);
        if (xs.length !== 1 || xs[0].ean !== e.xmlEan || e.externalIdToSet !== e.xmlSku)
            errors.push(`XML identity drift ${e.xmlSku}`);
        if (external.has(e.xmlSku) && external.get(e.xmlSku) !== e.productId)
            errors.push(`externalId claimant ${e.xmlSku}`);
        if (
            e.matchType === 'UNIQUE_EAN' &&
            (!e.productBarcode ||
                e.productBarcode !== e.xmlEan ||
                xe.length !== 1 ||
                (eanProducts.get(e.xmlEan)?.length ?? 0) !== 1)
        )
            errors.push(`EAN uniqueness drift ${e.productId}`);
        const actual = {
            externalId: null,
            sku: p.sku,
            barcode: p.barcode,
            title: p.title,
            titleEn: p.titleEn ?? null,
            titleLv: p.titleLv ?? null,
            brand: p.brand,
            category: p.category,
            description: p.description ?? '',
            technicalSpecs: p.technicalSpecs ?? null,
            specVolume: p.specVolume ?? null,
            specType: p.specType ?? null,
            image: p.image ?? '',
            images: p.images ?? [],
            isActive: p.isActive,
            isDeleted: p.isDeleted,
            price: Number(p.price),
            stock: p.stock ?? 0,
            createdAt: p.createdAt?.toISOString(),
        };
        if (phase === 'post-sync') {
            actual.price = e.baseline.price;
            actual.stock = e.baseline.stock;
        }
        if (JSON.stringify(actual) !== JSON.stringify(e.baseline))
            errors.push(`protected baseline drift ${e.productId}`);
    }
    if (errors.length) throw new Error(`Sixth-wave validation failed:\n- ${errors.join('\n- ')}`);
    return a;
}
export type SixthAtomicStore = {
    transaction: <T>(
        fn: (tx: {
            loadAll: () => Promise<SixthProduct[]>;
            updateExternalIds: (entries: SixthEntry[]) => Promise<number>;
        }) => Promise<T>
    ) => Promise<T>;
};
export async function applySixthAtomic(
    store: SixthAtomicStore,
    content: string | Buffer,
    xml: string,
    policy?: { allowlistSha?: string; xmlSha?: string }
) {
    return store.transaction(async (tx) => {
        const all = await tx.loadAll(),
            a = validateSixth(content, xml, all, 'pre-backfill', policy),
            n = await tx.updateExternalIds(a.entries);
        if (n !== a.entries.length) throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${n}`);
        return n;
    });
}
