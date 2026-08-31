import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

const ALLOWED_USER_FIELDS = new Set(['comment'])
const ALLOWED_ADMIN_FIELDS = new Set(['status', 'resolution', 'resolvedAt', 'comment'])

class ReturnStockRestoreError extends Error {
  constructor(readonly productId: string) {
    super(`Unable to restore stock for ${productId}`)
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const ret = await prisma.returnRequest.findUnique({ where: { id } })
    if (!ret) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (user.platformRole !== 'admin' && ret.email !== user.email) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      return: { ...ret, createdAt: ret.createdAt.toISOString(), resolvedAt: ret.resolvedAt?.toISOString() ?? null },
    })
  } catch (e) {
    logApiError("[returns/:id GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const ret = await prisma.returnRequest.findUnique({ where: { id } })
    if (!ret) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (user.platformRole !== 'admin' && ret.email !== user.email) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const allowed = user.platformRole === 'admin' ? ALLOWED_ADMIN_FIELDS : ALLOWED_USER_FIELDS
    const data: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (allowed.has(key)) {
        if (key === 'resolvedAt') {
          data[key] = value ? new Date(value as string) : null
        } else {
          data[key] = value
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'no_allowed_fields' }, { status: 400 })
    }

    const STOCK_RESTORE_STATUSES = new Set(['approved', 'refunded'])
    const requestedStatus = typeof data.status === 'string' ? data.status : null

    const updated = await prisma.$transaction(async (tx) => {
      let after
      let changed = true
      if (requestedStatus && STOCK_RESTORE_STATUSES.has(requestedStatus)) {
        const transitioned = await tx.returnRequest.updateMany({
          where: { id, status: { notIn: [...STOCK_RESTORE_STATUSES] } },
          data,
        })
        if (transitioned.count !== 1) {
          changed = false
          after = await tx.returnRequest.findUniqueOrThrow({ where: { id } })
        } else {
          type ReturnItem = { productId: string; quantity: number }
          const returnItems = ret.items as ReturnItem[]
          for (const item of returnItems) {
            if (item.productId && typeof item.quantity === 'number' && item.quantity > 0) {
              const restored = await tx.product.updateMany({
                // Archived products still own stock and may later be restored.
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              })
              if (restored.count !== 1) throw new ReturnStockRestoreError(item.productId)
            }
          }
          after = await tx.returnRequest.findUniqueOrThrow({ where: { id } })
        }
      } else {
        after = await tx.returnRequest.update({ where: { id }, data })
      }
      if (changed) {
        await appendServerAudit(tx, req, user, {
          action: user.platformRole === 'admin' ? 'return.admin_updated' : 'return.comment_updated',
          entityType: 'return', entityId: id, entityTitle: ret.orderId, before: ret, after,
          reason: typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null,
        })
      }
      return after
    })

    return NextResponse.json({
      return: { ...updated, createdAt: updated.createdAt.toISOString(), resolvedAt: updated.resolvedAt?.toISOString() ?? null },
    })
  } catch (e) {
    if (e instanceof ReturnStockRestoreError) {
      return NextResponse.json({ error: 'return_stock_restore_failed', productId: e.productId }, { status: 409 })
    }
    logApiError("[returns/:id PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

