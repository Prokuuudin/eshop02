import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFile } from 'node:fs/promises';
import { parseGrinsXml } from '../lib/sync/grins-xml-parser';
import { getErpExtraData } from '../lib/sync/erp-extra-data-store';
import { selectedStock } from '../lib/sync/sync-rules';
import { assertSixthBaseline, SIXTH_WAVE_EXCLUDED_IDS, validateSixth } from '../lib/sync/sixth-wave';
async function main() {
    const postBackfill = process.argv.includes('--post-backfill'),
        postSync = process.argv.includes('--post-sync'),
        phase = postSync ? 'post-sync' : postBackfill ? 'post-backfill' : 'pre-backfill';
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
        const [content, xml] = await Promise.all([
                readFile('sixth-wave-allowlist.json'),
                readFile('export.xml', 'utf8'),
            ]),
            all = await prisma.product.findMany({
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
            a = validateSixth(content, xml, all, phase),
            ids = a.entries.map((e) => e.productId),
            products = all.filter((p) => ids.includes(p.id)),
            duplicates = await prisma.$queryRawUnsafe<Array<{ externalId: string }>>(
                `SELECT "externalId" FROM "Product" WHERE "externalId" IS NOT NULL GROUP BY "externalId" HAVING COUNT(*)>1`
            ),
            feed = new Map(parseGrinsXml(xml).map((x) => [x.externalId, x])),
            extra = postSync ? await getErpExtraData(prisma) : {},
            byId = new Map(products.map((p) => [p.id, p]));
        let incorrectLinks = 0,
            protectedMismatches = 0,
            priceMismatches = 0,
            stockMismatches = 0,
            erpTierMismatches = 0,
            warehouseMismatches = 0;
        for (const e of a.entries) {
            const p = byId.get(e.productId),
                x = feed.get(e.xmlSku);
            if (!p || p.externalId !== (phase === 'pre-backfill' ? null : e.xmlSku))
                incorrectLinks++;
            if (
                p &&
                (p.sku !== e.baseline.sku ||
                    p.barcode !== e.baseline.barcode ||
                    p.title !== e.baseline.title ||
                    p.brand !== e.baseline.brand ||
                    p.category !== e.baseline.category ||
                    p.isActive !== e.baseline.isActive ||
                    p.isDeleted !== e.baseline.isDeleted)
            )
                protectedMismatches++;
            if (postSync && p && x) {
                const expected = x.price > 0 ? x.price : e.baseline.price;
                if (Number(p.price) !== expected) priceMismatches++;
                if (p.stock !== selectedStock(x.warehouseQuantities ?? {})) stockMismatches++;
                const stored = extra[e.xmlSku];
                if (!stored || JSON.stringify(stored.prices) !== JSON.stringify(x.prices))
                    erpTierMismatches++;
                if (
                    !stored ||
                    JSON.stringify(stored.warehouseQuantities) !==
                        JSON.stringify(x.warehouseQuantities)
                )
                    warehouseMismatches++;
            }
        }
        const syncRun = postSync
                ? await prisma.syncRun.findFirst({
                      where: { triggeredBy: { startsWith: 'controlled-sixth-wave:' } },
                      orderBy: { startedAt: 'desc' },
                  })
                : null,
            processed = syncRun
                ? await prisma.product.count({ where: { lastSyncRunId: syncRun.id } })
                : 0,
            outsideScope = syncRun
                ? await prisma.product.count({
                      where: { lastSyncRunId: syncRun.id, id: { notIn: ids } },
                  })
                : 0,
            excludedLinked = postBackfill || postSync
                ? await prisma.product.count({
                      where: {
                          id: { in: [...SIXTH_WAVE_EXCLUDED_IDS] },
                          externalId: { not: null },
                      },
                  })
                : 0;
        const current = await state();
        if (!postBackfill && !postSync) assertSixthBaseline(current);
        const result = {
            phase,
            scope: a.entries.length,
            correctLinks: a.entries.length - incorrectLinks,
            incorrectLinks,
            duplicateExternalIds: duplicates.length,
            protectedMismatches,
            priceMismatches,
            stockMismatches,
            erpTierMismatches,
            warehouseMismatches,
            processed,
            outsideScope,
            excludedLinked,
            syncRun: syncRun
                ? {
                      id: syncRun.id,
                      status: syncRun.status,
                      productsTotal: syncRun.productsTotal,
                      productsSynced: syncRun.productsSynced,
                      deactivated: syncRun.deactivated,
                      errorCount: syncRun.errorCount,
                      triggeredBy: syncRun.triggeredBy,
                  }
                : null,
            state: current,
            databaseWrites: 0,
        };
        console.log(JSON.stringify(result, null, 2));
        if (
            incorrectLinks ||
            duplicates.length ||
            protectedMismatches ||
            priceMismatches ||
            stockMismatches ||
            erpTierMismatches ||
            warehouseMismatches ||
            excludedLinked ||
            (postSync &&
                (!syncRun ||
                    processed !== 30 ||
                    outsideScope !== 0 ||
                    syncRun.status !== 'completed' ||
                    syncRun.productsTotal !== 30 ||
                    syncRun.productsSynced !== 30 ||
                    syncRun.deactivated !== 0 ||
                    syncRun.errorCount !== 0))
        )
            throw new Error('SIXTH_WAVE_VERIFICATION_FAILED');
    } finally {
        await prisma.$disconnect();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
