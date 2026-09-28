import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFile } from 'node:fs/promises';
import { parseGrinsXml } from '../lib/sync/grins-xml-parser';
import { executeSixthSync, prepareSixthPlan } from '../lib/sync/controlled-sixth-wave';
import { assertSixthPostBackfillBaseline, assertSixthPostSyncBaseline, sixthSha, validateSixth } from '../lib/sync/sixth-wave';
const arg = (n: string) => {
    const i = process.argv.indexOf(n);
    return i < 0 ? undefined : process.argv[i + 1];
};
async function main() {
    const execute = process.argv.includes('--execute'), postSync = process.argv.includes('--post-sync'), allowlist = arg('--allowlist'),
        file = arg('--file');
    if (!allowlist || !file) throw new Error('Explicit --allowlist and --file are required');
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
        const [content, xml] = await Promise.all([readFile(allowlist), readFile(file, 'utf8')]),
            before = await state();
        if (postSync) assertSixthPostSyncBaseline(before);
        else assertSixthPostBackfillBaseline(before);
        const all = await prisma.product.findMany({
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
            a = validateSixth(content, xml, all, postSync ? 'post-sync' : 'post-backfill');
        if (execute) {
            const result = await executeSixthSync(prisma, a, parseGrinsXml(xml), sixthSha(xml), sixthSha(content));
            console.log(JSON.stringify({ event: 'sixth_wave_controlled_sync_complete', result }, null, 2));
            return;
        }
        const plan = await prepareSixthPlan(prisma, a, parseGrinsXml(xml)),
            after = await state();
        if (JSON.stringify(before) !== JSON.stringify(after))
            throw new Error('SIXTH_PREVIEW_SAFETY_FAILURE');
        console.log(
            JSON.stringify(
                { event: 'sixth_wave_controlled_sync_preview', ...plan.metrics, before, after },
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
