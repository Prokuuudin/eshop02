import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { cropProductImage, loadProductImage, makeCropPreview } from '@/lib/product-image-crop'
import { applyProductOverride, type ProductOverride } from '@/lib/product-overrides-store'
import { mapDbToProduct } from '@/lib/product-overrides-mapping'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

type RequestBody = { productId?: string; action?: 'preview' | 'apply' }

async function readMediaAsset(name: string): Promise<Buffer | null> {
  const asset = await prisma.mediaAsset.findUnique({ where: { name }, select: { data: true } })
  return asset ? Buffer.from(asset.data) : null
}

async function getProductAndSource(productId: string) {
  const row = await prisma.product.findUnique({ where: { id: productId } })
  if (!row || row.isDeleted) return null
  const setting = await prisma.keyValueSetting.findUnique({ where: { key: 'product-overrides' } })
  const overrides = setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value)
    ? setting.value as Record<string, ProductOverride> : {}
  const product = applyProductOverride(mapDbToProduct(row), overrides[productId])
  const source = product.image || product.images?.[0]
  return source ? { row, product, source } : null
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    const body = await request.json() as RequestBody
    const productId = body.productId?.trim()
    if (!productId || !['preview', 'apply'].includes(body.action ?? '')) return errorResponse('Invalid request', 400)
    const found = await getProductAndSource(productId)
    if (!found) return errorResponse('Product or image not found', 404)
    const original = await loadProductImage(found.source, readMediaAsset)
    const result = await cropProductImage(original)
    if (body.action === 'preview') {
      return successResponse({
        skipped: result.skipped, reason: result.reason,
        originalUrl: found.source,
        preview: await makeCropPreview(result.buffer),
        sourceSize: { width: result.sourceWidth, height: result.sourceHeight },
        crop: result.crop,
      })
    }
    if (result.skipped) return errorResponse(result.reason ?? 'Image does not need correction', 409)
    const name = `crop-${productId}-0.png`
    const url = `/api/media/${name}`
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(203948721)`
      await tx.mediaAsset.upsert({
        where: { name },
        create: { name, mimeType: 'image/png', size: result.buffer.length, data: new Uint8Array(result.buffer) },
        update: { mimeType: 'image/png', size: result.buffer.length, data: new Uint8Array(result.buffer) },
      })
      const setting = await tx.keyValueSetting.findUnique({ where: { key: 'product-overrides' } })
      const overrides = setting?.value && typeof setting.value === 'object' && !Array.isArray(setting.value)
        ? setting.value as Record<string, ProductOverride> : {}
      const previousImages = found.product.images?.length ? found.product.images : [found.source]
      const images = [url, ...previousImages.slice(1)]
      overrides[productId] = { ...overrides[productId], image: url, images }
      await tx.keyValueSetting.upsert({
        where: { key: 'product-overrides' },
        create: { key: 'product-overrides', value: overrides as Prisma.InputJsonValue },
        update: { value: overrides as Prisma.InputJsonValue },
      })
      await appendServerAudit(tx, request, actor, {
        action: 'product.image_crop', entityType: 'product', entityId: productId,
        entityTitle: found.product.title,
        before: { image: found.source }, after: { image: url },
        details: `${result.sourceWidth}x${result.sourceHeight} -> ${result.crop?.width}x${result.crop?.height}`,
      })
    })
    return successResponse({ image: url, images: [url, ...(found.product.images?.slice(1) ?? [])] })
  } catch (error) {
    logApiError('Admin product image crop error:', error)
    const message = error instanceof Error ? error.message : 'Image processing failed'
    const clientError = /allowed|HTTPS|too large|not found|download failed|timeout/i.test(message)
    return errorResponse(clientError ? message : 'Image processing failed', clientError ? 400 : 500)
  }
}
