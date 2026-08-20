import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const sub = await prisma.productNewsSubscription.findUnique({ where: { id } })
    if (!sub) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (sub.userId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const body = (await req.json()) as {
      notifyPrice?: boolean
      notifyStock?: boolean
      notifyPromo?: boolean
    }
    const data: { notifyPrice?: boolean; notifyStock?: boolean; notifyPromo?: boolean } = {}
    if (typeof body.notifyPrice === 'boolean') data.notifyPrice = body.notifyPrice
    if (typeof body.notifyStock === 'boolean') data.notifyStock = body.notifyStock
    if (typeof body.notifyPromo === 'boolean') data.notifyPromo = body.notifyPromo

    const nextPrice = data.notifyPrice ?? sub.notifyPrice
    const nextStock = data.notifyStock ?? sub.notifyStock
    const nextPromo = data.notifyPromo ?? sub.notifyPromo
    if (!nextPrice && !nextStock && !nextPromo) {
      return NextResponse.json({ error: 'select_at_least_one' }, { status: 400 })
    }

    await prisma.productNewsSubscription.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError('[product-news/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const sub = await prisma.productNewsSubscription.findUnique({ where: { id } })
    if (!sub) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (sub.userId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    await prisma.productNewsSubscription.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError('[product-news/:id DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
