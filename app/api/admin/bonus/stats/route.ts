import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { logApiError } from '@/lib/observability'

const TYPES = ['all', 'order_earn', 'order_spend', 'admin_adjustment', 'expiry'] as const

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireAdmin()
    if (actor instanceof NextResponse) return actor
    const params = req.nextUrl.searchParams
    const search = params.get('search')?.trim() ?? ''
    const requestedType = params.get('type') ?? 'all'
    const type = TYPES.includes(requestedType as typeof TYPES[number]) ? requestedType : 'all'
    const from = params.get('from') ? new Date(params.get('from')!) : null
    const to = params.get('to') ? new Date(`${params.get('to')}T23:59:59.999Z`) : null
    const page = Math.max(1, Number(params.get('page')) || 1)
    const take = 25
    const createdAt = {
      ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
      ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
    }
    const where: Prisma.BonusTransactionWhereInput = {
      ...(type !== 'all' ? { type } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(search ? { user: { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ] } } : {}),
    }

    const [earned, spent, orderGroups, usersWithBalance, balanceAggregate, segments, top5, history, historyTotal, manualAggregate] = await Promise.all([
      prisma.bonusTransaction.aggregate({ where: { points: { gt: 0 } }, _sum: { points: true } }),
      prisma.bonusTransaction.aggregate({ where: { points: { lt: 0 } }, _sum: { points: true } }),
      prisma.bonusTransaction.groupBy({ by: ['orderId'], where: { orderId: { not: null } } }),
      prisma.user.count({ where: { platformRole: { not: 'admin' }, bonusPoints: { gt: 0 } } }),
      prisma.user.aggregate({ where: { platformRole: { not: 'admin' } }, _sum: { bonusPoints: true } }),
      Promise.all([
        prisma.user.count({ where: { platformRole: { not: 'admin' }, bonusPoints: 0 } }),
        prisma.user.count({ where: { platformRole: { not: 'admin' }, bonusPoints: { gte: 1, lte: 100 } } }),
        prisma.user.count({ where: { platformRole: { not: 'admin' }, bonusPoints: { gte: 101, lte: 500 } } }),
        prisma.user.count({ where: { platformRole: { not: 'admin' }, bonusPoints: { gt: 500 } } }),
      ]),
      prisma.user.findMany({ where: { platformRole: { not: 'admin' }, bonusPoints: { gt: 0 } }, orderBy: { bonusPoints: 'desc' }, take: 5, select: { id: true, name: true, email: true, bonusPoints: true } }),
      prisma.bonusTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take, include: { user: { select: { name: true, email: true } } } }),
      prisma.bonusTransaction.count({ where }),
      prisma.bonusTransaction.aggregate({ where: { type: 'admin_adjustment' }, _sum: { points: true } }),
    ])

    return NextResponse.json({
      totalEarned: earned._sum.points ?? 0,
      totalSpent: Math.abs(spent._sum.points ?? 0),
      ordersWithBonus: orderGroups.length,
      usersWithBalance,
      totalBalance: balanceAggregate._sum.bonusPoints ?? 0,
      manualAdjustmentTotal: manualAggregate._sum.points ?? 0,
      segments,
      top5,
      history: history.map((row) => ({ ...row, userName: row.user.name, userEmail: row.user.email })),
      historyTotal,
      page,
      pageSize: take,
    })
  } catch (error) {
    logApiError('[admin/bonus/stats GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
