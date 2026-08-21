import { NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { requireAdminPermission } from '@/lib/server-auth'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { toNum, toNumOrNull } from '@/lib/decimal'

export const runtime = 'nodejs'

const SCAN_LIMIT = 800
const BATCH_LIMIT = 30

type Snapshot = { price: number; oldPrice: number | null }

function readSnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.price !== 'number') return null
  const oldPrice = typeof record.oldPrice === 'number' ? record.oldPrice : null
  return { price: record.price, oldPrice }
}

export type PriceBatchItem = {
  id: string
  title: string
  before: Snapshot
  after: Snapshot
  state: 'available' | 'reverted' | 'changed'
}

export type PriceBatch = {
  requestId: string
  appliedAt: string
  adminEmail: string
  adminName: string | null
  action: string
  items: PriceBatchItem[]
  revertState: 'available' | 'partial' | 'reverted' | 'not_available'
}

export async function GET(): Promise<Response> {
  const gate = await requireAdminPermission('catalog.read')
  if (gate instanceof NextResponse) return gate
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: 'product', action: { in: ['product.update', 'product.revert'] } },
      orderBy: { sequence: 'desc' },
      take: SCAN_LIMIT,
      select: { requestId: true, entityId: true, entityTitle: true, before: true, after: true, at: true, adminEmail: true, adminName: true, action: true },
    })

    const groups = new Map<string, typeof rows>()
    for (const row of rows) {
      if (!row.requestId) continue
      const before = readSnapshot(row.before)
      const after = readSnapshot(row.after)
      if (!before || !after) continue
      if (before.price === after.price && before.oldPrice === after.oldPrice) continue
      const list = groups.get(row.requestId) ?? []
      list.push(row)
      groups.set(row.requestId, list)
    }

    const orderedIds = [...groups.keys()].slice(0, BATCH_LIMIT)
    const productIds = [...new Set(orderedIds.flatMap((requestId) => groups.get(requestId)!.map((row) => row.entityId)))]
    const currentProducts = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, price: true, oldPrice: true } })
    const currentById = new Map(currentProducts.map((p) => [p.id, { price: toNum(p.price), oldPrice: toNumOrNull(p.oldPrice) }]))

    const batches: PriceBatch[] = orderedIds.map((requestId) => {
      const groupRows = groups.get(requestId)!
      const first = groupRows[0]
      const items: PriceBatchItem[] = groupRows.map((row) => {
        const before = readSnapshot(row.before)!
        const after = readSnapshot(row.after)!
        const current = currentById.get(row.entityId)
        const state: PriceBatchItem['state'] = !current
          ? 'changed'
          : current.price === after.price && current.oldPrice === after.oldPrice
            ? 'available'
            : current.price === before.price && current.oldPrice === before.oldPrice
              ? 'reverted'
              : 'changed'
        return { id: row.entityId, title: row.entityTitle ?? row.entityId, before, after, state }
      })
      const states = new Set(items.map((item) => item.state))
      const revertState: PriceBatch['revertState'] = states.size === 1 && states.has('reverted')
        ? 'reverted'
        : states.has('available')
          ? (states.size === 1 ? 'available' : 'partial')
          : 'not_available'
      return {
        requestId, appliedAt: first.at.toISOString(), adminEmail: first.adminEmail, adminName: first.adminName,
        action: first.action, items, revertState,
      }
    })

    return successResponse({ batches })
  } catch (error) {
    logApiError('Admin price-batches GET error:', error)
    return errorResponse('Internal server error', 500)
  }
}
