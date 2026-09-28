import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFile } from 'node:fs/promises';
import { assertSixthBaseline, validateSixth } from '../lib/sync/sixth-wave';
const arg = (n: string) => {
    const i = process.argv.indexOf(n);
    return i < 0 ? undefined : process.argv[i + 1];
};
async function main() {
    const apply = process.argv.includes('--apply'),
        allowlistPath = arg('--allowlist'),
        xmlPath = arg('--file'),
        backup = arg('--backup-branch');
    if (!allowlistPath || !xmlPath) throw new Error('Explicit --allowlist and --file are required');
    if (apply && !backup) throw new Error('SIXTH_WAVE_APPLY_BLOCKED_BY_BACKUP');
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
    const select = {
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
    };
    try {
        const [content, xml] = await Promise.all([
                readFile(allowlistPath),
                readFile(xmlPath, 'utf8'),
            ]),
            before = await state();
        assertSixthBaseline(before);
        const all = await prisma.product.findMany({ select }),
            a = validateSixth(content, xml, all);
        let updated = 0;
        if (apply)
            updated = await prisma.$transaction(
                async (tx) => {
                    const now = await state();
                    assertSixthBaseline(now);
                    const locked = await tx.product.findMany({ select }),
                        current = validateSixth(content, xml, locked),
                        n = await tx.$executeRawUnsafe(
                            `UPDATE "Product" p SET "externalId"=v.external_id FROM (SELECT * FROM unnest($1::text[],$2::text[],$3::text[]) x(id,sku,external_id)) v WHERE p.id=v.id AND p.sku IS NOT DISTINCT FROM v.sku AND p."externalId" IS NULL AND p."isDeleted"=false`,
                            current.entries.map((e) => e.productId),
                            current.entries.map((e) => e.productSku),
                            current.entries.map((e) => e.externalIdToSet)
                        );
                    if (n !== current.entries.length)
                        throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${n}`);
                    return n;
                },
                { isolationLevel: 'Serializable', timeout: 120000, maxWait: 10000 }
            );
        const after = await state();
        if (!apply && JSON.stringify(before) !== JSON.stringify(after))
            throw new Error('DATABASE_CHANGED_DURING_DRY_RUN');
        console.log(
            JSON.stringify(
                {
                    event: 'sixth_wave_backfill',
                    mode: apply ? 'apply' : 'dry-run',
                    backupBranch: backup ?? null,
                    candidates: a.entries.length,
                    wouldUpdate: a.entries.length,
                    skipped: 0,
                    conflicts: 0,
                    updated,
                    databaseWrites: updated,
                    before,
                    after,
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
