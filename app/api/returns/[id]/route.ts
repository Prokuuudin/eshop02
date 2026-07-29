import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

const ALLOWED_USER_FIELDS = new Set(['comment'])
const ALLOWED_ADMIN_FIELDS = new Set(['status', 'resolution', 'resolvedAt', 'comment'])

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
    console.error('[returns/:id GET]', e)
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
      if (requestedStatus && STOCK_RESTORE_STATUSES.has(requestedStatus)) {
        const transitioned = await tx.returnRequest.updateMany({
          where: { id, status: { notIn: [...STOCK_RESTORE_STATUSES] } },
          data,
        })
        if (transitioned.count !== 1) {
          return tx.returnRequest.findUniqueOrThrow({ where: { id } })
        }

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
        return tx.returnRequest.findUniqueOrThrow({ where: { id } })
      }

      return tx.returnRequest.update({ where: { id }, data })
    })

    return NextResponse.json({
      return: { ...updated, createdAt: updated.createdAt.toISOString(), resolvedAt: updated.resolvedAt?.toISOString() ?? null },
    })
  } catch (e) {
    console.error('[returns/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
