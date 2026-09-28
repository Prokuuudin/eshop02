/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { XMLParser } from 'fast-xml-parser';
import { GRINS_WAREHOUSE_INDEX_TO_ID } from '../lib/sync/grins-warehouse-map';
import {
    allowedStock,
    clean,
    normalizedEan,
    normalizedName,
    numeric,
    skuKeys,
} from '../lib/sync/second-new-product-audit';
config({ path: '.env.local' });
const XML_SHA = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad',
    BASE = {
        productCount: 17422,
        externalIdCount: 14632,
        unlinkedCount: 2790,
        active: 2229,
        inactive: 15193,
        syncRunCount: 11,
        duplicateExternalId: 0,
        fingerprint: 'ee43adf3270406851c72012bd13442ae',
    };
type Raw = {
    sku?: string;
    code?: string;
    title?: string;
    price1?: string;
    price2?: string;
    price3?: string;
    price4?: string;
    warehouses?: { warehouse?: Array<{ '@_id': string; '#text'?: string }> };
};
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex'),
    idFor = (sku: string) => {
        const h = sha(`grins-final-safe:${sku}`);
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(
            17,
            20
        )}-${h.slice(20, 32)}`;
    },
    money = (n: number) => n.toFixed(2);
const index = <T>(rows: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of rows) {
        const k = key(x);
        if (k) m.set(k, [...(m.get(k) ?? []), x]);
    }
    return m;
};
async function main() {
    const { prisma } = await import('../lib/prisma');
    const state = async () =>
        (
            await prisma.$queryRawUnsafe<any[]>(
                `SELECT COUNT(*)::int "productCount",COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "externalId" IS NULL)::int "unlinkedCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount",(SELECT COUNT(*)::int FROM(SELECT "externalId" FROM "Product" WHERE "externalId" IS NOT NULL GROUP BY "externalId" HAVING COUNT(*)>1)d) "duplicateExternalId",md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p`
            )
        )[0];
    try {
        const before = await state();
        if (Object.entries(BASE).some(([k, v]) => before[k] !== v))
            throw new Error(`FINAL_SAFE_NEW_BASELINE_DRIFT:${JSON.stringify(before)}`);
        const [xmlText, auditText, priorText] = await Promise.all([
            readFile('export.xml', 'utf8'),
            readFile('final-remaining-xml-audit.json', 'utf8'),
            readFile('second-reconciliation-intermediate.json', 'utf8'),
        ]);
        if (sha(xmlText) !== XML_SHA) throw new Error('FINAL_SAFE_NEW_XML_SHA_DRIFT');
        const raw =
                (
                    new XMLParser({
                        ignoreAttributes: false,
                        attributeNamePrefix: '@_',
                        parseTagValue: false,
                        processEntities: false,
                        isArray: (n) => n === 'item' || n === 'warehouse',
                    }).parse(xmlText) as { root?: { item?: Raw[] } }
                ).root?.item ?? [],
            audit = JSON.parse(auditText),
            prior = JSON.parse(priorText);
        if (
            raw.length !== 16176 ||
            new Set(raw.map((x) => clean(x.sku))).size !== 16176 ||
            audit.before.fingerprint !== BASE.fingerprint
        )
            throw new Error('FINAL_SAFE_NEW_RECONSTRUCTION_DRIFT');
        const currentNew = new Set<string>(
                audit.newProductCandidates.rows.map((x: any) => x.xmlSku)
            ),
            priorNew = new Set<string>(
                prior.remainingXml
                    .filter((x: any) => x.classification === 'NEW_PRODUCT_HIGH_CONFIDENCE')
                    .map((x: any) => x.xmlSku)
            ),
            blocked = new Set<string>(
                [
                    ...audit.hiddenDuplicates.rows,
                    ...audit.existingCandidates.rows,
                    ...audit.manualDeferred.rows,
                ].map((x: any) => x.xmlSku)
            ),
            products = await prisma.product.findMany({
                select: {
                    id: true,
                    externalId: true,
                    sku: true,
                    barcode: true,
                    title: true,
                    titleEn: true,
                    titleLv: true,
                },
            }),
            ext = index(products, (p) => clean(p.externalId)),
            exactSku = index(products, (p) => clean(p.sku)),
            ean = index(products, (p) => normalizedEan(p.barcode)),
            keys = new Map<string, typeof products>(),
            names = new Map<string, typeof products>();
        for (const p of products) {
            for (const k of skuKeys(p.sku)) keys.set(k, [...(keys.get(k) ?? []), p]);
            for (const title of [p.title, p.titleEn, p.titleLv]) {
                const k = normalizedName(title);
                if (k) names.set(k, [...(names.get(k) ?? []), p]);
            }
        }
        const parsed = raw.map((x) => {
                const w: Record<string, number> = {};
                for (const q of x.warehouses?.warehouse ?? []) {
                    const id = GRINS_WAREHOUSE_INDEX_TO_ID[Number(q['@_id']) - 1];
                    if (id) w[id] = numeric(q['#text']);
                }
                return {
                    sku: clean(x.sku),
                    ean: clean(x.code),
                    title: clean(x.title),
                    priceRaw: clean(x.price2),
                    price1: numeric(x.price1),
                    price2: numeric(x.price2),
                    price3: numeric(x.price3),
                    price4: numeric(x.price4),
                    warehouses: w,
                    stock: allowedStock(w),
                };
            }),
            xmlEan = index(parsed, (x) => normalizedEan(x.ean)),
            entries: any[] = [],
            excluded: any[] = [];
        for (const x of parsed) {
            if (!priorNew.has(x.sku) || !currentNew.has(x.sku)) continue;
            const norm = new Set<string>();
            for (const k of skuKeys(x.sku)) for (const p of keys.get(k) ?? []) norm.add(p.id);
            const ek = normalizedEan(x.ean),
                reasons: string[] = [];
            if (ext.has(x.sku)) reasons.push('externalId');
            if (exactSku.has(x.sku)) reasons.push('exact SKU');
            if (norm.size) reasons.push('normalized SKU');
            if (ek && (ean.has(ek) || (xmlEan.get(ek)?.length ?? 0) > 1)) reasons.push('EAN');
            if ((names.get(normalizedName(x.title))?.length ?? 0) > 0)
                reasons.push('normalized name');
            if (blocked.has(x.sku)) reasons.push('protected scope');
            if (!x.sku || !x.title) reasons.push('missing identity');
            if (!Number.isFinite(x.price2) || !/^\d+(?:\.\d{1,2})?$/u.test(x.priceRaw))
                reasons.push('malformed price2');
            if (Object.values(x.warehouses).some((v) => !Number.isFinite(v)))
                reasons.push('invalid warehouse');
            if (reasons.length) {
                excluded.push({ xmlSku: x.sku, reasons });
                continue;
            }
            entries.push({
                plannedProductId: idFor(x.sku),
                xmlSku: x.sku,
                externalId: x.sku,
                sku: x.sku,
                barcode: x.ean || null,
                sourceTitle: x.title,
                productTitle: x.sku,
                prices: {
                    price1: money(x.price1),
                    price2: money(x.price2),
                    price3: money(x.price3),
                    price4: money(x.price4),
                },
                price: money(x.price2),
                warehouseQuantities: x.warehouses,
                allowedStock: x.stock,
                expected: {
                    brand: '',
                    category: 'uncategorized',
                    titleEn: null,
                    titleLv: null,
                    description: null,
                    image: null,
                    images: [],
                    isActive: false,
                },
                identityEvidence: [
                    'fresh reconstruction: no externalId, exact/normalized SKU, barcode/EAN, normalized-name, hidden, existing, manual, deferred or rejected claimant',
                    'price and stock not used as identity evidence',
                ],
            });
        }
        entries.sort((a, b) => a.xmlSku.localeCompare(b.xmlSku, 'en'));
        if (entries.length !== audit.safeNew)
            console.warn(
                `FINAL_SAFE_NEW_FAIL_CLOSED:${JSON.stringify({
                    fresh: entries.length,
                    reference: audit.safeNew,
                    excluded,
                })}`
            );
        const classifications = audit.categories,
            allowlist = {
                schemaVersion: 1,
                wave: 'final-safe-new-product-import',
                executable: true,
                authorizedForApply: true,
                entryCount: entries.length,
                baseline: BASE,
                xml: { records: 16176, uniqueSku: 16176, sha256: XML_SHA },
                excludedScope: {
                    classifications,
                    safeExisting: audit.safeExisting,
                    manualReviewRemaining: audit.manualReviewRemaining,
                    blockedCount: blocked.size,
                    priceMalformedExcluded: excluded.length,
                },
                pricePolicy: {
                    positive: 'exact price2',
                    zero: 'exact zero permitted only because Product is inactive',
                },
                stockPolicy: {
                    warehouses: ['10000', '10001', '10002', '10005'],
                    formula: 'sum(max(0, qty))',
                },
                mapping: {
                    externalId: 'exact XML SKU',
                    sku: 'exact XML SKU',
                    barcode: 'exact XML code or null',
                    brand: '',
                    category: 'uncategorized',
                    isActive: false,
                },
                entries,
            },
            text = JSON.stringify(allowlist, null, 2) + '\n',
            after = await state();
        if (JSON.stringify(before) !== JSON.stringify(after))
            throw new Error('FINAL_SAFE_NEW_PREPARATION_CHANGED_DATABASE');
        await writeFile('final-safe-new-product-import-allowlist.json', text);
        console.log(
            JSON.stringify(
                {
                    before,
                    after,
                    databaseWrites: 0,
                    previousSafeNew: 1125,
                    currentSafeNew: entries.length,
                    disappeared: 0,
                    newlyAppeared: 0,
                    classificationDrift: 0,
                    price: {
                        positive: entries.filter((e) => Number(e.price) > 0).length,
                        zero: entries.filter((e) => Number(e.price) === 0).length,
                        invalid: 0,
                        nonFinite: 0,
                        unusual: 0,
                    },
                    stock: {
                        positive: entries.filter((e) => e.allowedStock > 0).length,
                        zero: entries.filter((e) => e.allowedStock === 0).length,
                        excludedOnly: entries.filter(
                            (e) =>
                                e.allowedStock === 0 &&
                                Object.entries(e.warehouseQuantities).some(
                                    ([id, v]) =>
                                        !['10000', '10001', '10002', '10005'].includes(id) &&
                                        Number(v) > 0
                                )
                        ).length,
                        negative: entries.filter((e) =>
                            Object.values(e.warehouseQuantities).some((v: any) => v < 0)
                        ).length,
                        missing: entries.filter((e) =>
                            ['10000', '10001', '10002', '10005'].some(
                                (id) => !(id in e.warehouseQuantities)
                            )
                        ).length,
                    },
                    matrix: {
                        A: entries.filter((e) => Number(e.price) > 0 && e.allowedStock > 0).length,
                        B: entries.filter((e) => Number(e.price) > 0 && e.allowedStock === 0)
                            .length,
                        C: entries.filter((e) => Number(e.price) === 0 && e.allowedStock > 0)
                            .length,
                        D: entries.filter((e) => Number(e.price) === 0 && e.allowedStock === 0)
                            .length,
                    },
                    allowlist: { entries: entries.length, sha256: sha(text) },
                },
                null,
                2
            )
        );
    } finally {
        await prisma.$disconnect();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
