import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest): Promise<Response> {
  const gate = await requireAdminPermission('catalog.read')
  if (gate instanceof NextResponse) return gate

  try {
    const params = request.nextUrl.searchParams
    const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(params.get('limit') ?? '50', 10) || 50))
    const threshold = Math.max(0, Number.parseInt(params.get('threshold') ?? '5', 10) || 0)
    const filter = params.get('filter') === 'out' || params.get('filter') === 'all'
      ? params.get('filter') as 'out' | 'all'
      : 'low'
    const search = params.get('q')?.trim()
    const hideUnconfirmed = params.get('hideUnconfirmed') === 'true'

    const alertFilter: Prisma.ProductWhereInput = filter === 'out'
      ? { stock: 0 }
      : filter === 'low'
        ? { stock: { gt: 0, lte: threshold } }
        : {}
    const where: Prisma.ProductWhereInput = {
      isDeleted: false,
      ...alertFilter,
      ...(hideUnconfirmed ? { externalId: { not: null } } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    }
    const catalogWhere: Prisma.ProductWhereInput = { isDeleted: false }

    const [rows, total, productCount, outCount, lowCount, unconfirmedCount] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: [{ stock: 'asc' }, { title: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, title: true, brand: true, category: true, stock: true,
          sku: true, price: true, externalId: true,
        },
      }),
      prisma.product.count({ where }),
      prisma.product.count({ where: catalogWhere }),
      prisma.product.count({ where: { ...catalogWhere, stock: 0 } }),
      prisma.product.count({ where: { ...catalogWhere, stock: { gt: 0, lte: threshold } } }),
      prisma.product.count({ where: { ...catalogWhere, externalId: null } }),
    ])

    return NextResponse.json({
      products: rows.map(({ externalId, price, ...product }) => ({
        ...product,
        price: Number(price),
        synced: externalId !== null,
      })),
      total,
      productCount,
      outCount,
      lowCount,
      unconfirmedCount,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (error) {
    logApiError('[admin/stock-alerts GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
