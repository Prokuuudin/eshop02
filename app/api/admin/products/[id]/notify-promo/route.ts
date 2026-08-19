import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { notifyPromo } from '@/lib/product-news-notify'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    const { id } = await params
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, title: true, isDeleted: true },
    })
    if (!product || product.isDeleted) return NextResponse.json({ error: 'product_not_found' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as { message?: string }
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : undefined

    await notifyPromo(id, product.title, message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError('[admin/products/:id/notify-promo POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
