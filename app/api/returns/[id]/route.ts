import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

const ALLOWED_USER_FIELDS = new Set(['comment'])
const ALLOWED_ADMIN_FIELDS = new Set(['status', 'resolution', 'resolvedAt', 'comment'])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    console.error('[returns/:id GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const prevStatus = ret.status
    const nextStatus = typeof data.status === 'string' ? data.status : prevStatus

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.returnRequest.update({ where: { id }, data })

      // Restore stock when transitioning into approved/refunded for the first time
      if (
        STOCK_RESTORE_STATUSES.has(nextStatus) &&
        !STOCK_RESTORE_STATUSES.has(prevStatus)
      ) {
        type ReturnItem = { productId: string; quantity: number }
        const returnItems = ret.items as ReturnItem[]
        for (const item of returnItems) {
          if (item.productId && typeof item.quantity === 'number' && item.quantity > 0) {
            await tx.product.updateMany({
              where: { id: item.productId, isDeleted: false },
              data: { stock: { increment: item.quantity } },
            })
          }
        }
      }

      return result
    })

    return NextResponse.json({
      return: { ...updated, createdAt: updated.createdAt.toISOString(), resolvedAt: updated.resolvedAt?.toISOString() ?? null },
    })
  } catch (e) {
    console.error('[returns/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
