import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { logApiError } from '@/lib/observability'
import { parseOffsetPagination } from '@/lib/pagination'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const caller = await requireAdminPermission('marketing.manage')
    if (caller instanceof NextResponse) return caller
    const search = req.nextUrl.searchParams.get('search')?.trim() ?? ''
    const delivery = req.nextUrl.searchParams.get('delivery') ?? 'all'
    if (!['all', 'email', 'app', 'both', 'disabled'].includes(delivery)) {
      return NextResponse.json({ error: 'invalid_delivery_filter' }, { status: 400 })
    }
    const { skip, take } = parseOffsetPagination(req.nextUrl.searchParams, { defaultTake: 50, maxTake: 100 })
    // Imported cardholders remain dormant until they complete registration.
    // Synthetic and anonymised addresses must never appear as recipients.
    const where = {
      platformRole: 'customer',
      mustChangePassword: false,
      NOT: [
        { email: { endsWith: '@client.local', mode: 'insensitive' as const } },
        { email: { endsWith: '@deleted.invalid', mode: 'insensitive' as const } },
      ],
      ...(delivery === 'disabled'
        ? { notificationsSubscribed: false }
        : delivery === 'all'
          ? {}
          : { notificationsSubscribed: true, notificationChannel: delivery }),
      ...(search ? { OR: [
      { name: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } },
      { phone: { contains: search, mode: 'insensitive' as const } }, { cardNumber: { contains: search, mode: 'insensitive' as const } },
      ] } : {}),
    }
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take, select: { id: true, email: true, name: true, phone: true, cardNumber: true, notificationChannel: true, notificationsSubscribed: true } }),
      prisma.user.count({ where }),
    ])
    return NextResponse.json({ users, total, skip, take })
  } catch (error) {
    logApiError('[admin/notifications/recipients]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
