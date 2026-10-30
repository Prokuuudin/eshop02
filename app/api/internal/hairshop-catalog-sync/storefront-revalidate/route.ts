import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCorrelationId, logOperationalEvent } from '@/lib/observability'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'
import { BRAND_LINE_STOREFRONT_TAGS, revalidateBrandLineStorefront } from '@/lib/brand-lines/brand-line-cache'

export const runtime = 'nodejs'

// Called by the BrandLine release CLI after its transaction has committed: a CLI has
// no Next.js cache context, so the running application drops the dependent caches.
// Same machine credential as the catalog sync; the call itself writes nothing else.

const SYSTEM_ACTOR = {
  id: 'system:hairshop-catalog-sync', email: 'hairshop-catalog-sync@system.local', name: 'Catalog sync',
  platformRole: 'system', approvalRequired: false, auditLoggingEnabled: true,
} as ServerUser

const bodySchema = z.object({
  reason: z.literal('brand_line_bootstrap'),
  snapshotId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u),
  planSha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict()

function isAuthorized(request: NextRequest): boolean {
  const configured = process.env.HAIRSHOP_CATALOG_SYNC_SECRET ?? ''
  const supplied = request.headers.get('x-hairshop-catalog-sync-key') ?? ''
  if (configured.length < 32 || supplied.length < 32) return false
  const expected = Buffer.from(configured)
  const actual = Buffer.from(supplied)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId = getCorrelationId(request)
  if (!process.env.HAIRSHOP_CATALOG_SYNC_SECRET) return NextResponse.json({ error: 'catalog_sync_not_configured', correlationId }, { status: 503 })
  if (!isAuthorized(request)) return NextResponse.json({ error: 'unauthorized', correlationId }, { status: 401 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', correlationId }, { status: 400 })
  // Only a bootstrap that actually committed may trigger this.
  const audited = await prisma.auditLog.count({ where: { action: 'catalog.brand_line_bootstrap_applied', entityId: parsed.data.snapshotId, requestId: parsed.data.planSha256 } })
  if (audited === 0) return NextResponse.json({ error: 'bootstrap_not_found', correlationId }, { status: 404 })

  revalidateBrandLineStorefront()
  await prisma.$transaction(tx => appendServerAudit(tx, request, SYSTEM_ACTOR, {
    action: 'storefront.cache_revalidated',
    entityType: 'storefront',
    entityId: 'brand-line-bootstrap',
    details: `Revalidated ${BRAND_LINE_STOREFRONT_TAGS.join(', ')} after BrandLine plan ${parsed.data.planSha256}`,
  }))
  logOperationalEvent({ event: 'brand_line_storefront_revalidated', correlationId, snapshotId: parsed.data.snapshotId })
  return NextResponse.json({ revalidated: [...BRAND_LINE_STOREFRONT_TAGS], correlationId })
}
