/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import type { ExtendedPrismaClient } from '../prisma';
import type { ErpProduct } from './erp-adapter';
import { getErpExtraData, mergeEnabledPriceTiers } from './erp-extra-data-store';
import { getSyncRules, selectedStock } from './sync-rules';
import type { SixthAllowlist } from './sixth-wave';
export async function prepareSixthPlan(
    db: ExtendedPrismaClient,
    a: SixthAllowlist,
    feed: ErpProduct[]
) {
    const ids = a.entries.map((e) => e.productId),
        [products, currentExtra] = await Promise.all([
            db.product.findMany({
                where: { id: { in: ids } },
                select: {
                    id: true,
                    sku: true,
                    externalId: true,
                    price: true,
                    stock: true,
                    isDeleted: true,
                },
            }),
            getErpExtraData(db),
        ]),
        byId = new Map(products.map((p) => [p.id, p])),
        byXml = new Map(feed.map((x) => [x.externalId, x])),
        extraData = { ...currentExtra },
        rules = getSyncRules();
    let price2Positive = 0,
        price2Zero = 0,
        priceWouldChange = 0,
        priceUnchanged = 0,
        over50PercentChanges = 0,
        largeAbsoluteChanges = 0,
        zeroPriceRegressions = 0,
        stockWouldChange = 0,
        stockUnchanged = 0,
        positiveToZero = 0,
        zeroToPositive = 0,
        resultingStockZero = 0,
        stockFormulaMismatches = 0,
        erpSemanticUpdates = 0;
    const rows = a.entries.map((e) => {
        const p = byId.get(e.productId),
            x = byXml.get(e.xmlSku);
        if (!p || !x || p.externalId !== e.xmlSku || p.sku !== e.productSku || p.isDeleted)
            throw new Error(`SIXTH_SCOPE_DRIFT:${e.productId}`);
        const originalPrice = Number(p.price),
            price = x.price > 0 ? x.price : originalPrice,
            stock = selectedStock(x.warehouseQuantities ?? {});
        if (x.price > 0) price2Positive++;
        else price2Zero++;
        if (price === originalPrice) priceUnchanged++;
        else priceWouldChange++;
        if (originalPrice > 0 && Math.abs(price - originalPrice) / originalPrice > 0.5)
            over50PercentChanges++;
        if (Math.abs(price - originalPrice) >= 50) largeAbsoluteChanges++;
        if (originalPrice > 0 && price === 0) zeroPriceRegressions++;
        if (stock === p.stock) stockUnchanged++;
        else stockWouldChange++;
        if (p.stock > 0 && stock === 0) positiveToZero++;
        if (p.stock === 0 && stock > 0) zeroToPositive++;
        if (stock === 0) resultingStockZero++;
        if (stock !== x.stock) stockFormulaMismatches++;
        const next = mergeEnabledPriceTiers(
            currentExtra[e.xmlSku],
            {
                prices: x.prices ?? { price1: 0, price2: 0, price3: 0, price4: 0 },
                warehouseQuantities: x.warehouseQuantities ?? {},
            },
            rules.enabledPriceTiers
        );
        if (JSON.stringify(next) !== JSON.stringify(currentExtra[e.xmlSku])) erpSemanticUpdates++;
        extraData[e.xmlSku] = next;
        return { id: p.id, externalId: e.xmlSku, sku: e.productSku, price, stock };
    });
    if (rows.length !== a.entries.length || stockFormulaMismatches)
        throw new Error('SIXTH_PLAN_GATE_FAILED');
    return {
        rows,
        extraData,
        metrics: {
            scope: rows.length,
            price2Positive,
            price2Zero,
            priceWouldChange,
            priceUnchanged,
            zeroTierPreserved: price2Zero,
            over50PercentChanges,
            largeAbsoluteChanges,
            zeroPriceRegressions,
            stockWouldChange,
            stockUnchanged,
            positiveToZero,
            zeroToPositive,
            resultingStockZero,
            stockFormulaMismatches,
            predictedTierRecords: rows.length,
            predictedWarehouseSnapshots: rows.length,
            erpSemanticUpdates,
            inserts: 0,
            deactivations: 0,
            outsideScopeChanges: 0,
            databaseWrites: 0,
        },
    };
}

export async function executeSixthSync(
    db: ExtendedPrismaClient,
    a: SixthAllowlist,
    feed: ErpProduct[],
    xmlSha: string,
    allowlistSha: string
) {
    const startedAt = new Date(), runId = randomUUID();
    const result = await db.$transaction(async (tx) => {
        const plan = await prepareSixthPlan(tx as unknown as ExtendedPrismaClient, a, feed),
            params: unknown[] = plan.rows.flatMap((r) => [r.id, r.externalId, r.sku, r.price, r.stock]);
        params.push(runId);
        const values = plan.rows.map((_, i) => `($${i*5+1},$${i*5+2},$${i*5+3},$${i*5+4}::numeric,$${i*5+5}::int)`).join(','),
            updated = await tx.$executeRawUnsafe(`UPDATE "Product" p SET price=v.price,stock=v.stock,"lastSyncRunId"=$${plan.rows.length*5+1},"updatedAt"=now() FROM (VALUES ${values}) v(id,"externalId",sku,price,stock) WHERE p.id=v.id AND p."externalId"=v."externalId" AND p.sku IS NOT DISTINCT FROM v.sku AND p."isDeleted"=false`, ...params);
        if (updated !== a.entries.length) throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${updated}`);
        await tx.keyValueSetting.upsert({where:{key:'erp-extra-data'},create:{key:'erp-extra-data',value:plan.extraData as unknown as Prisma.InputJsonValue},update:{value:plan.extraData as unknown as Prisma.InputJsonValue}});
        await tx.syncRun.create({data:{id:runId,status:'completed',triggeredBy:`controlled-sixth-wave:${xmlSha}:${allowlistSha}`,startedAt,finishedAt:new Date(),productsTotal:a.entries.length,productsSynced:updated,deactivated:0,errorCount:0}});
        return { updated, metrics: plan.metrics };
    }, { isolationLevel: 'Serializable', timeout: 120_000, maxWait: 10_000 });
    return { runId, durationMs: Date.now()-startedAt.getTime(), inserted:0, deactivated:0, rollback:false, ...result };
}
