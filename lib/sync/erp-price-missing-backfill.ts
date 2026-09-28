/**
 * Write step of scripts/backfill-erp-price-missing.ts. Raw SQL on purpose: Prisma
 * updateMany would implicitly stamp Product."updatedAt" (@updatedAt), and a technical
 * backfill/rollback must write the target column only. The expected current value in the
 * WHERE clause makes a concurrently changed row fail the row-count check instead of being
 * overwritten.
 */
export function buildErpPriceMissingUpdate(ids: string[], nextValue: boolean): { sql: string; params: [string[], boolean, boolean] } {
  return {
    sql: `UPDATE "Product"
     SET "erpPriceMissing" = $2
     WHERE id = ANY($1::text[])
       AND "erpPriceMissing" = $3
       AND "isDeleted" = false`,
    params: [ids, nextValue, !nextValue],
  }
}
