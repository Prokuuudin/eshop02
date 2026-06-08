import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

// GET /api/admin/order-meta?ids=id1,id2,...
// Returns statuses and notes for given order IDs
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const idsParam = req.nextUrl.searchParams.get('ids') || ''
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200)

    if (ids.length === 0) return NextResponse.json({ statuses: {}, notes: {} })

    const [statusRows, noteRows] = await Promise.all([
      prisma.orderStatusRecord.findMany({ where: { orderId: { in: ids } } }),
      prisma.orderNote.findMany({ where: { orderId: { in: ids } } }),
    ])

    const statuses: Record<string, string> = {}
    for (const row of statusRows) statuses[row.orderId] = row.status

    const notes: Record<string, string> = {}
    for (const row of noteRows) notes[row.orderId] = row.note

    return NextResponse.json({ statuses, notes })
  } catch (e) {
    console.error('[admin/order-meta GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST /api/admin/order-meta — upsert status or note
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { orderId, status, note } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId_required' }, { status: 400 })

    if (status !== undefined) {
      await prisma.orderStatusRecord.upsert({
        where: { orderId },
        create: { orderId, status },
        update: { status },
      })
    }

    if (note !== undefined) {
      await prisma.orderNote.upsert({
        where: { orderId },
        create: { orderId, note },
        update: { note },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/order-meta POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
