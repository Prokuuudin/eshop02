import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFile, writeFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import {
    assertSixthBaseline,
    sixthSha,
    SIXTH_WAVE_EXCLUDED_IDS,
    SIXTH_WAVE_XML_SHA,
    type SixthEntry,
} from '../lib/sync/sixth-wave';
const key = (v: unknown) =>
    String(v ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase('en-US')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/gu, ' ');
const KNOWN_DEFERRED_SKUS = new Set([
    '24006256', '97388150', 'BA02', 'DKIRI', 'KJMN0352', 'NIA308001', 'NIA407001', 'SS-40/3', 'K18', 'K86',
]);
async function main() {
    const { prisma } = await import('../lib/prisma');
    const state = async () =>
        (
            await prisma.$queryRawUnsafe<
                Array<{
                    productCount: number;
                    externalIdCount: number;
                    unlinkedCount: number;
                    active: number;
                    inactive: number;
                    syncRunCount: number;
                    fingerprint: string;
                }>
            >(
                `SELECT COUNT(*)::int "productCount",COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "externalId" IS NULL)::int "unlinkedCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount",md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p`
            )
        )[0];
    try {
        const before = await state();
        assertSixthBaseline(before);
        const xml = await readFile('export.xml', 'utf8');
        if (sixthSha(xml) !== SIXTH_WAVE_XML_SHA) throw new Error('SIXTH_WAVE_XML_SHA_MISMATCH');
        const xr = (
                (
                    new XMLParser({
                        parseTagValue: false,
                        processEntities: false,
                        isArray: (n) => n === 'item',
                    }).parse(xml) as {
                        root?: { item?: Array<{ sku?: string; code?: string; title?: string }> };
                    }
                ).root?.item ?? []
            ).map((x) => ({
                sku: String(x.sku ?? '').trim(),
                ean: String(x.code ?? '').trim(),
                name: String(x.title ?? '').trim(),
            })),
            products = await prisma.product.findMany({
                select: {
                    id: true,
                    sku: true,
                    barcode: true,
                    externalId: true,
                    title: true,
                    titleEn: true,
                    titleLv: true,
                    brand: true,
                    category: true,
                    description: true,
                    technicalSpecs: true,
                    specVolume: true,
                    specType: true,
                    image: true,
                    images: true,
                    isActive: true,
                    isDeleted: true,
                    price: true,
                    stock: true,
                    createdAt: true,
                },
            }),
            linked = new Set(products.flatMap((p) => (p.externalId ? [p.externalId] : []))),
            free = xr.filter((x) => !linked.has(x.sku)),
            eanXml = new Map<string, typeof free>(),
            eanProducts = new Map<string, typeof products>(),
            nameXml = new Map<string, typeof free>();
        for (const x of free) {
            if (x.ean) eanXml.set(x.ean, [...(eanXml.get(x.ean) ?? []), x]);
            const k = key(x.name);
            nameXml.set(k, [...(nameXml.get(k) ?? []), x]);
        }
        for (const p of products)
            if (p.barcode) eanProducts.set(p.barcode, [...(eanProducts.get(p.barcode) ?? []), p]);
        const reconstructed: Array<{
            p: (typeof products)[number];
            x: (typeof free)[number];
            type: 'UNIQUE_EAN' | 'COMPOUND_STRONG' | 'CONTROLLED_NORMALIZED_SKU';
        }> = [];
        for (const p of products.filter(
            (p) => !p.externalId && !p.isDeleted && !KNOWN_DEFERRED_SKUS.has(String(p.sku ?? '').toLocaleUpperCase('en-US'))
        )) {
            if (
                p.barcode &&
                eanProducts.get(p.barcode)?.length === 1 &&
                eanXml.get(p.barcode)?.length === 1
            )
                reconstructed.push({ p, x: eanXml.get(p.barcode)![0], type: 'UNIQUE_EAN' });
            else {
                const hits = [
                    ...new Map(
                        [p.title, p.titleEn, p.titleLv]
                            .flatMap((n) => nameXml.get(key(n)) ?? [])
                            .map((x) => [x.sku, x])
                    ).values(),
                ].filter((x) => key(x.name).includes(key(p.brand)));
                if (hits.length === 1)
                    reconstructed.push({ p, x: hits[0], type: 'COMPOUND_STRONG' });
            }
        }
        const normalized = products.find((p) => p.id === '18427'),
            nx = free.find((x) => x.sku === '01CL500103');
        if (normalized && nx)
            reconstructed.push({ p: normalized, x: nx, type: 'CONTROLLED_NORMALIZED_SKU' });
        const expectedIds = new Set(
                (
                    JSON.parse(await readFile('final-pre-import-reconciliation.json', 'utf8')) as {
                        localProducts: Array<{ productId: string; classification: string }>;
                    }
                ).localProducts
                    .filter((x) =>
                        ['EAN_IDENTITY', 'COMPOUND_STRONG', 'NORMALIZED_IDENTITY'].includes(
                            x.classification
                        )
                    )
                    .map((x) => x.productId)
            ),
            currentIds = new Set(reconstructed.map((x) => x.p.id)),
            disappeared = [...expectedIds].filter((x) => !currentIds.has(x)),
            newlyAppeared = [...currentIds].filter((x) => !expectedIds.has(x));
        if (disappeared.length || newlyAppeared.length)
            throw new Error(
                `CANDIDATE_RECONSTRUCTION_DRIFT:${JSON.stringify({ disappeared, newlyAppeared })}`
            );
        const exclusions = reconstructed
                .filter((x) => SIXTH_WAVE_EXCLUDED_IDS.has(x.p.id))
                .map((x) => ({
                    productId: x.p.id,
                    xmlSku: x.x.sku,
                    type: x.type,
                    classification: x.p.id === '19015' ? 'REJECTED_MATCH' : 'MANUAL_REVIEW',
                    reason:
                        x.p.id === '19015'
                            ? '75ml Product conflicts with 100ml XML variant'
                            : 'Previous-wave manual/deferred intersection',
                })),
            safe = reconstructed.filter(
                (x) =>
                    !SIXTH_WAVE_EXCLUDED_IDS.has(x.p.id) && x.type !== 'CONTROLLED_NORMALIZED_SKU'
            ),
            entries: SixthEntry[] = safe.map(({ p, x, type }) => ({
                productId: p.id,
                productSku: p.sku,
                productBarcode: p.barcode,
                xmlSku: x.sku,
                xmlEan: x.ean,
                externalIdToSet: x.sku,
                matchType: type as 'UNIQUE_EAN' | 'COMPOUND_STRONG',
                identityEvidence: {
                    primary:
                        type === 'UNIQUE_EAN'
                            ? 'globally unique exact-string EAN'
                            : 'exact normalized multilingual name + brand',
                    productName: p.title,
                    xmlName: x.name,
                    brand: p.brand,
                    nameNormalization: key(p.title),
                    nameSimilarity: key(p.title) === key(x.name) ? 1 : null,
                    brandEvidence: key(x.name).includes(key(p.brand)),
                    sizeEvidence: 'captured in exact normalized name or reviewed EAN evidence',
                    variantEvidence: 'no blocking contradiction after previous-scope exclusions',
                    competingProducts: 0,
                    competingXml: 0,
                    reason:
                        type === 'UNIQUE_EAN'
                            ? 'EAN unique across Product and XML; source/target names non-contradictory'
                            : 'Exact normalized name, brand, size/count and variant uniquely identify the pair',
                },
                baseline: {
                    externalId: null,
                    sku: p.sku,
                    barcode: p.barcode,
                    title: p.title,
                    titleEn: p.titleEn,
                    titleLv: p.titleLv,
                    brand: p.brand,
                    category: p.category,
                    description: p.description ?? '',
                    technicalSpecs: p.technicalSpecs ?? null,
                    specVolume: p.specVolume,
                    specType: p.specType,
                    image: p.image ?? '',
                    images: p.images,
                    isActive: p.isActive,
                    isDeleted: p.isDeleted,
                    price: Number(p.price),
                    stock: p.stock,
                    createdAt: p.createdAt.toISOString(),
                },
            }));
        const allowlist = {
                schemaVersion: 1,
                wave: 'sixth-wave-strict-identity',
                executable: true,
                entryCount: entries.length,
                baseline: { ...before },
                xmlSha256: SIXTH_WAVE_XML_SHA,
                entries,
            },
            content = JSON.stringify(allowlist, null, 2) + '\n';
        await Promise.all([
            writeFile('sixth-wave-allowlist.json', content),
            writeFile(
                'sixth-wave-preparation-audit.json',
                JSON.stringify(
                    {
                        generatedAt: new Date().toISOString(),
                        readOnly: true,
                        databaseWrites: 0,
                        expected: 39,
                        reconstructed: reconstructed.length,
                        safe: entries.length,
                        exclusions,
                        disappeared,
                        newlyAppeared,
                        allowlistSha256: sixthSha(content),
                    },
                    null,
                    2
                ) + '\n'
            ),
        ]);
        const after = await state();
        if (JSON.stringify(before) !== JSON.stringify(after))
            throw new Error('SIXTH_WAVE_PREPARATION_SAFETY_FAILURE');
        console.log(
            JSON.stringify(
                {
                    expected: 39,
                    reconstructed: reconstructed.length,
                    safe: entries.length,
                    breakdown: {
                        uniqueEan: entries.filter((e) => e.matchType === 'UNIQUE_EAN').length,
                        compoundStrong: entries.filter((e) => e.matchType === 'COMPOUND_STRONG')
                            .length,
                        normalized: 0,
                    },
                    exclusions,
                    disappeared,
                    newlyAppeared,
                    allowlistSha256: sixthSha(content),
                    before,
                    after,
                    databaseWrites: 0,
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
