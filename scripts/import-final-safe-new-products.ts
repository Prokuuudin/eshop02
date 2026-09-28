/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import type { Prisma } from '../generated/prisma/client';
import type { ErpExtraData } from '../lib/sync/erp-extra-data-store';
import {
    FINAL_SAFE_XML_SHA,
    assertBaseline,
    parseAllowlist,
    preparePlan,
    sha256,
} from '../lib/sync/final-safe-new-import';
config({ path: '.env.local' });
const arg = (n: string) => {
    const i = process.argv.indexOf(n);
    return i < 0 ? undefined : process.argv[i + 1];
};
async function main() {
    const execute = process.argv.includes('--execute'),
        allow = arg('--allowlist'),
        file = arg('--file'),
        backup = arg('--backup-branch');
    if (!allow || !file) throw new Error('EXPLICIT_ALLOWLIST_AND_XML_REQUIRED');
    if (execute && !backup) throw new Error('FINAL_SAFE_NEW_IMPORT_BLOCKED_BY_BACKUP');
    const { prisma } = await import('../lib/prisma'),
        state = async (db: any = prisma) =>
            (
                await db.$queryRawUnsafe(
                    `SELECT COUNT(*)::int "productCount",COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "externalId" IS NULL)::int "unlinkedCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount",(SELECT COUNT(*)::int FROM(SELECT "externalId" FROM "Product" WHERE "externalId" IS NOT NULL GROUP BY "externalId" HAVING COUNT(*)>1)d) "duplicateExternalId",md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p`
                )
            )[0];
    try {
        const [content, xml] = await Promise.all([readFile(allow), readFile(file, 'utf8')]);
        if (sha256(xml) !== FINAL_SAFE_XML_SHA) throw new Error('FINAL_SAFE_NEW_XML_SHA_DRIFT');
        const a = parseAllowlist(content),
            before = await state(),
            existing = await prisma.product.findMany({
                select: { id: true, externalId: true, sku: true, barcode: true },
            }),
            plan = preparePlan(a, existing);
        if (!execute) {
            if (
                plan.metrics.conflicts ||
                !(
                    (plan.metrics.wouldInsert === a.entryCount &&
                        plan.metrics.alreadyImported === 0) ||
                    (plan.metrics.wouldInsert === 0 &&
                        plan.metrics.alreadyImported === a.entryCount)
                )
            )
                throw new Error(`FINAL_SAFE_NEW_DRY_RUN_CONFLICT:${JSON.stringify(plan.metrics)}`);
            if (plan.metrics.wouldInsert) assertBaseline(before);
            const after = await state();
            if (JSON.stringify(before) !== JSON.stringify(after))
                throw new Error('FINAL_SAFE_NEW_DRY_RUN_CHANGED_DATABASE');
            console.log(
                JSON.stringify(
                    { event: 'final_safe_new_import_dry_run', ...plan.metrics, before, after },
                    null,
                    2
                )
            );
            return;
        }
        assertBaseline(before);
        if (plan.metrics.conflicts || plan.insertable.length !== a.entryCount)
            throw new Error('FINAL_SAFE_NEW_IMPORT_FAIL_CLOSED');
        const startedAt = new Date(),
            runId = crypto.randomUUID(),
            inserted = await prisma.$transaction(
                async (tx) => {
                    assertBaseline(await state(tx));
                    const locked = preparePlan(
                        a,
                        await tx.product.findMany({
                            select: { id: true, externalId: true, sku: true, barcode: true },
                        })
                    );
                    if (locked.metrics.conflicts || locked.insertable.length !== a.entryCount)
                        throw new Error('FINAL_SAFE_NEW_LOCKED_SCOPE_MISMATCH');
                    let count = 0;
                    for (let i = 0; i < locked.insertable.length; i += 250) {
                        const result = await tx.product.createMany({
                            data: locked.insertable
                                .slice(i, i + 250)
                                .map((e) => ({
                                    id: e.plannedProductId,
                                    externalId: e.externalId,
                                    sku: e.sku,
                                    barcode: e.barcode,
                                    title: e.productTitle,
                                    titleEn: null,
                                    titleLv: null,
                                    description: null,
                                    brand: '',
                                    category: 'uncategorized',
                                    price: e.price,
                                    stock: e.allowedStock,
                                    image: null,
                                    images: [],
                                    badges: [],
                                    relatedProductIds: [],
                                    oftenBoughtTogether: [],
                                    certificates: [],
                                    compatibleEquipment: [],
                                    isActive: false,
                                    isDeleted: false,
                                    isCustom: false,
                                    lastSyncRunId: runId,
                                })),
                        });
                        count += result.count;
                    }
                    if (count !== a.entryCount)
                        throw new Error(`FINAL_SAFE_NEW_AFFECTED_COUNT:${count}`);
                    const stored = await tx.keyValueSetting.findUnique({
                            where: { key: 'erp-extra-data' },
                        }),
                        currentExtra =
                            stored?.value &&
                            typeof stored.value === 'object' &&
                            !Array.isArray(stored.value)
                                ? (stored.value as unknown as Record<string, ErpExtraData>)
                                : {};
                    const extra = { ...currentExtra };
                    for (const e of locked.insertable)
                        extra[e.externalId] = {
                            prices: {
                                price1: Number(e.prices.price1),
                                price2: Number(e.prices.price2),
                                price3: Number(e.prices.price3),
                                price4: Number(e.prices.price4),
                            },
                            warehouseQuantities: e.warehouseQuantities,
                        };
                    await tx.keyValueSetting.upsert({
                        where: { key: 'erp-extra-data' },
                        create: {
                            key: 'erp-extra-data',
                            value: extra as unknown as Prisma.InputJsonValue,
                        },
                        update: { value: extra as unknown as Prisma.InputJsonValue },
                    });
                    await tx.syncRun.create({
                        data: {
                            id: runId,
                            status: 'completed',
                            triggeredBy: `controlled-final-safe-new-import:${FINAL_SAFE_XML_SHA}:${sha256(
                                content
                            )}`,
                            startedAt,
                            finishedAt: new Date(),
                            productsTotal: a.entryCount,
                            productsSynced: count,
                            deactivated: 0,
                            errorCount: 0,
                        },
                    });
                    return count;
                },
                { isolationLevel: 'Serializable', timeout: 300000, maxWait: 10000 }
            );
        console.log(
            JSON.stringify(
                { event: 'final_safe_new_import_complete', inserted, runId, backupBranch: backup },
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
