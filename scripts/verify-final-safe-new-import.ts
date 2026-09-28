/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { getErpExtraData } from '../lib/sync/erp-extra-data-store';
import {
    FINAL_SAFE_BASELINE,
    FINAL_SAFE_ALLOWLIST_SHA,
    FINAL_SAFE_XML_SHA,
    parseAllowlist,
    sha256,
} from '../lib/sync/final-safe-new-import';
config({ path: '.env.local' });
async function main() {
    const post = process.argv.includes('--post-import'),
        { prisma } = await import('../lib/prisma');
    try {
        const content = await readFile('final-safe-new-product-import-allowlist.json'),
            a = parseAllowlist(content, FINAL_SAFE_ALLOWLIST_SHA),
            ids = a.entries.map((e) => e.plannedProductId),
            products = await prisma.product.findMany({
                where: { id: { in: ids } },
                select: {
                    id: true,
                    externalId: true,
                    sku: true,
                    barcode: true,
                    title: true,
                    price: true,
                    stock: true,
                    isActive: true,
                    isDeleted: true,
                    brand: true,
                    category: true,
                    lastSyncRunId: true,
                },
            }),
            byId = new Map(products.map((p) => [p.id, p])),
            extra = post ? await getErpExtraData(prisma) : {};
        let identity = 0,
            price = 0,
            stock = 0,
            active = 0,
            erp = 0,
            zeroPricePreserved = 0,
            zeroPriceActive = 0,
            excludedWarehouseOnlyWithProductStock = 0;
        const runIds = new Set<string>();
        for (const e of a.entries) {
            const p = byId.get(e.plannedProductId);
            if (!post) {
                if (p) identity++;
                continue;
            }
            if (
                !p ||
                p.externalId !== e.externalId ||
                p.sku !== e.sku ||
                p.barcode !== e.barcode ||
                p.title !== e.productTitle ||
                p.brand !== '' ||
                p.category !== 'uncategorized' ||
                p.isDeleted
            )
                identity++;
            if (p && Number(p.price) !== Number(e.price)) price++;
            if (p && p.stock !== e.allowedStock) stock++;
            if (p?.isActive) active++;
            if (Number(e.price) === 0 && p && Number(p.price) === 0) zeroPricePreserved++;
            if (Number(e.price) === 0 && p?.isActive) zeroPriceActive++;
            if (
                e.allowedStock === 0 &&
                Object.entries(e.warehouseQuantities).some(
                    ([id, quantity]) =>
                        !['10000', '10001', '10002', '10005'].includes(id) && quantity > 0
                ) &&
                p?.stock !== 0
            )
                excludedWarehouseOnlyWithProductStock++;
            if (p?.lastSyncRunId) runIds.add(p.lastSyncRunId);
            const x = extra[e.externalId];
            if (
                !x ||
                JSON.stringify(x.warehouseQuantities) !== JSON.stringify(e.warehouseQuantities) ||
                Object.keys(e.prices).some(
                    (k) =>
                        Number(x.prices[k as keyof typeof x.prices]) !==
                        Number(e.prices[k as keyof typeof e.prices])
                )
            )
                erp++;
        }
        const duplicates = (
                await prisma.$queryRawUnsafe<any[]>(
                    `SELECT COUNT(*)::int count FROM(SELECT "externalId" FROM "Product" WHERE "externalId" IS NOT NULL GROUP BY "externalId" HAVING COUNT(*)>1)d`
                )
            )[0].count,
            outsideFingerprint = (
                await prisma.$queryRawUnsafe<any[]>(
                    `SELECT md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p WHERE NOT(p.id=ANY($1::text[]))`,
                    ids
                )
            )[0].fingerprint,
            run =
                post && runIds.size === 1
                    ? await prisma.syncRun.findUnique({ where: { id: [...runIds][0] } })
                    : null,
            state = (
                await prisma.$queryRawUnsafe<any[]>(
                    `SELECT COUNT(*)::int "productCount",COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "externalId" IS NULL)::int "unlinkedCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount" FROM "Product"`
                )
            )[0],
            protectedProduct = await prisma.product.findUnique({
                where: { id: '13324' },
                select: { id: true, externalId: true },
            }),
            result = {
                phase: post ? 'post-import' : 'pre-import',
                scope: a.entryCount,
                found: products.length,
                identityMismatches: identity,
                priceMismatches: price,
                stockMismatches: stock,
                activeViolations: active,
                erpMismatches: erp,
                zeroPriceExpected: a.entries.filter((e) => Number(e.price) === 0).length,
                zeroPricePreserved,
                zeroPriceActive,
                excludedWarehouseOnlyExpected: a.entries.filter(
                    (e) =>
                        e.allowedStock === 0 &&
                        Object.entries(e.warehouseQuantities).some(
                            ([id, quantity]) =>
                                !['10000', '10001', '10002', '10005'].includes(id) &&
                                quantity > 0
                        )
                ).length,
                excludedWarehouseOnlyWithProductStock,
                duplicateExternalIds: duplicates,
                unexpectedInsertedIdentities: products.filter((p) => !ids.includes(p.id)).length,
                outsideScopeFingerprintMatches:
                    outsideFingerprint === FINAL_SAFE_BASELINE.fingerprint,
                runValid: Boolean(
                    run &&
                        run.status === 'completed' &&
                        run.productsTotal === a.entryCount &&
                        run.productsSynced === a.entryCount &&
                        !run.errorCount &&
                        !run.deactivated &&
                        run.triggeredBy ===
                            `controlled-final-safe-new-import:${FINAL_SAFE_XML_SHA}:${sha256(
                                content
                            )}`
                ),
                syncRun: run,
                state,
                protected97388150Untouched:
                    protectedProduct?.externalId === null &&
                    !a.entries.some((entry) => entry.xmlSku === '97388150'),
                databaseWrites: 0,
            };
        console.log(JSON.stringify(result, null, 2));
        if (
            (post &&
                (products.length !== a.entryCount ||
                    identity ||
                    price ||
                    stock ||
                    active ||
                    erp ||
                    zeroPricePreserved !== 695 ||
                    zeroPriceActive ||
                    excludedWarehouseOnlyWithProductStock ||
                    state.productCount !== 18544 ||
                    state.externalIdCount !== 15754 ||
                    state.unlinkedCount !== 2790 ||
                    state.active !== 2229 ||
                    state.inactive !== 16315 ||
                    state.syncRunCount !== 12 ||
                    !result.protected97388150Untouched ||
                    !result.runValid ||
                    !result.outsideScopeFingerprintMatches)) ||
            (!post && products.length !== 0) ||
            duplicates
        )
            throw new Error('FINAL_SAFE_NEW_VERIFICATION_FAILED');
    } finally {
        await prisma.$disconnect();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
