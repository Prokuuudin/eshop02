import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export type AdminProductSearchItem = {
  id: string
  title: string
  brand: string
  image: string | null
  isActive: boolean
}

const toItem = (p: {
  id: string
  title: string
  brand: string
  image: string | null
  isActive: boolean
}): AdminProductSearchItem => ({
  id: p.id,
  title: p.title,
  brand: p.brand,
  image: p.image,
  isActive: p.isActive,
})

const selectFields = { id: true, title: true, brand: true, image: true, isActive: true } as const

// Лёгкий поиск товаров для пикеров админки:
//   ?q=<текст>   — поиск по названию/бренду/ID (до 20 результатов)
//   ?ids=1,2,3   — резолв конкретных ID в название/картинку (для чипов уже выбранных)
export async function GET(req: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const idsParam = searchParams.get('ids')?.trim()

    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100)
      const rows = await prisma.product.findMany({
        where: { id: { in: ids }, isDeleted: false },
        select: selectFields,
      })
      return successResponse({ products: rows.map(toItem) })
    }

    if (!q) return successResponse({ products: [] })

    const rows = await prisma.product.findMany({
      where: {
        isDeleted: false,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { titleEn: { contains: q, mode: 'insensitive' } },
          { titleLv: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { id: { startsWith: q } },
          { sku: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
      take: 20,
      select: selectFields,
    })
    return successResponse({ products: rows.map(toItem) })
  } catch (error) {
    console.error('Admin product search error:', error)
    return errorResponse('Internal server error', 500)
  }
}
