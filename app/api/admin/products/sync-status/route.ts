import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

export const runtime = 'nodejs'

/**
 * Tells admin pages which product ids carry real, ERP-synced data (Product.externalId
 * set) versus which are still on whatever was set at import time — most notably the
 * nopCommerce `stock=10000` placeholder present on ~80% of the catalog until the ERP
 * integration lands for them too. Reuses the same `externalId !== null` signal that
 * lib/product-overrides-store.ts already relies on to block manual stock edits on
 * synced products, and that lib/warehouse-availability.ts uses to look up real
 * per-warehouse quantities — kept as its own tiny endpoint so callers that only need
 * this boolean (e.g. /admin/stock-alerts) don't have to widen the shared Product type
 * or touch the main /api/admin/products route.
 */
export async function GET(_req: NextRequest): Promise<Response> {
  const gate = await requireAdminPermission('catalog.read')
  if (gate instanceof NextResponse) return gate
  try {
    const rows = await prisma.product.findMany({
      where: { isDeleted: false },
      select: { id: true, externalId: true },
    })
    const syncedIds = rows.filter((row) => row.externalId !== null).map((row) => row.id)
    return NextResponse.json({ syncedIds })
  } catch (error) {
    logApiError('[admin/products/sync-status GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
