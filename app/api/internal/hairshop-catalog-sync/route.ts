import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { logOperationalEvent } from '@/lib/observability'
import {
  buildHairshopProductCreateData,
  hairshopCatalogSyncRequestSchema,
  planHairshopNewProducts,
  summarizeHairshopSync,
  type ExistingProductIdentity,
  type HairshopSyncDecision,
} from '@/lib/sync/hairshop-new-product-sync'

export const runtime = 'nodejs'

const IDENTITY_SELECT = {
  id: true,
  externalId: true,
  sku: true,
  barcode: true,
  isDeleted: true,
} as const

function isAuthorized(request: NextRequest): boolean {
  const configured = process.env.HAIRSHOP_CATALOG_SYNC_SECRET ?? ''
  const supplied = request.headers.get('x-hairshop-catalog-sync-key') ?? ''
  if (configured.length < 32 || supplied.length < 32) return false
  const expected = Buffer.from(configured)
  const actual = Buffer.from(supplied)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

async function loadExistingIdentities(db: typeof prisma | ExtendedTransactionClient): Promise<ExistingProductIdentity[]> {
  return db.product.findMany({ select: IDENTITY_SELECT })
}

function response(decisions: HairshopSyncDecision[], mode: 'dry-run' | 'apply', runId: string): NextResponse {
  return NextResponse.json({
    schemaVersion: 1,
    runId,
    mode,
    metrics: summarizeHairshopSync(decisions),
    results: decisions,
  })
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!process.env.HAIRSHOP_CATALOG_SYNC_SECRET) {
    return NextResponse.json({ error: 'catalog_sync_not_configured' }, { status: 503 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = hairshopCatalogSyncRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 })
  }

  const { mode, products, runId } = parsed.data
  if (mode === 'apply' && process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'catalog_sync_write_disabled' }, { status: 403 })
  }

  if (mode === 'dry-run') {
    const plan = planHairshopNewProducts(products, await loadExistingIdentities(prisma))
    logOperationalEvent({ event: 'hairshop_catalog_sync_dry_run', runId, ...summarizeHairshopSync(plan.decisions) })
    return response(plan.decisions, mode, runId)
  }

  const decisions = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('hairshop-catalog-new-products'))`
    const plan = planHairshopNewProducts(products, await loadExistingIdentities(tx))
    const createdIds = new Set<string>()
    for (const candidate of plan.insertable) {
      const created = await tx.product.create({ data: buildHairshopProductCreateData(candidate, runId), select: { id: true } })
      createdIds.add(created.id)
    }
    return plan.decisions.map(decision => decision.status === 'would_create' && createdIds.has(decision.targetProductId)
      ? { ...decision, status: 'created' as const, reasons: ['CREATED_NEW_PRODUCT'] }
      : decision)
  }, { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 60_000 })

  if (decisions.some(decision => decision.status === 'created')) {
    revalidateTag('storefront-bestsellers', { expire: 0 })
    revalidateTag('storefront-sale-products', { expire: 0 })
    revalidateTag('storefront-categories', { expire: 0 })
    revalidateTag('storefront-brands', { expire: 0 })
  }
  logOperationalEvent({ event: 'hairshop_catalog_sync_apply', runId, ...summarizeHairshopSync(decisions) })
  return response(decisions, mode, runId)
}
