import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { logApiError } from '@/lib/observability'
import { requireAdminPermission } from '@/lib/server-auth'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { toNum, toNumOrNull } from '@/lib/decimal'
import { appendServerAudit } from '@/lib/server-audit'
import { applyProductChanges, ProductMutationError } from '@/lib/product-mutation'
import { mapDbToProduct } from '@/lib/product-overrides-mapping'
import { notifyPriceChange } from '@/lib/product-news-notify'

export const runtime = 'nodejs'

type Snapshot = { price: number; oldPrice: number | null }

function readSnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.price !== 'number') return null
  const oldPrice = typeof record.oldPrice === 'number' ? record.oldPrice : null
  return { price: record.price, oldPrice }
}

type RevertItemResult = { id: string; title: string; oldPrice?: number; newPrice?: number; status: 'ok' | 'err'; error?: string }

type Params = { params: Promise<{ requestId: string }> }

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  const { requestId } = await params
  try {
    const rows = await prisma.auditLog.findMany({
      where: { requestId, entityType: 'product', action: { in: ['product.update', 'product.revert'] } },
      orderBy: { at: 'asc' },
      select: { entityId: true, entityTitle: true, before: true, after: true },
    })
    const targets = rows
      .map((row) => ({ id: row.entityId, title: row.entityTitle ?? row.entityId, before: readSnapshot(row.before), after: readSnapshot(row.after) }))
      .filter((row): row is { id: string; title: string; before: Snapshot; after: Snapshot } =>
        row.before !== null && row.after !== null && (row.before.price !== row.after.price || row.before.oldPrice !== row.after.oldPrice))
    if (targets.length === 0) return errorResponse('Batch not found or has nothing to revert', 404)

    const revertBatchId = randomUUID()
    const items: RevertItemResult[] = []
    for (const target of targets) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const current = await tx.product.findUnique({ where: { id: target.id } })
          if (!current || current.isDeleted) throw new ProductMutationError('Product not found', 404)
          if (toNum(current.price) !== target.after.price || toNumOrNull(current.oldPrice) !== target.after.oldPrice) {
            throw new ProductMutationError('Product changed since this batch — automatic revert skipped', 409)
          }
          const { before, next } = await applyProductChanges(tx, target.id, current.revision, { price: target.before.price, oldPrice: target.before.oldPrice })
          await appendServerAudit(tx, req, actor, {
            action: 'product.revert', entityType: 'product', entityId: target.id, entityTitle: next.title,
            before, after: mapDbToProduct(next), reason: `revert:${requestId}`, requestId: revertBatchId,
          })
          return { oldPrice: before.price, newPrice: toNum(next.price), title: next.title }
        })
        notifyPriceChange(target.id, result.title, result.oldPrice, result.newPrice)
          .catch((e) => logApiError('[price-batches revert notifyPriceChange]', e))
        items.push({ id: target.id, title: target.title, oldPrice: target.after.price, newPrice: target.before.price, status: 'ok' })
      } catch (error) {
        const message = error instanceof ProductMutationError ? error.message : 'Internal server error'
        items.push({ id: target.id, title: target.title, oldPrice: target.after.price, newPrice: target.before.price, status: 'err', error: message })
      }
    }

    const ok = items.filter((item) => item.status === 'ok').length
    return successResponse({ ok, err: items.length - ok, items })
  } catch (error) {
    logApiError('Admin price-batches revert error:', error)
    return errorResponse('Internal server error', 500)
  }
}
