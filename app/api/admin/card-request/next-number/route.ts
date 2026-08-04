import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// Короткие карты мастеров (без предъявленной физической карты) живут в том же
// поле User.cardNumber, что и импортированные карты клиентов (4-значные, ~10k
// занято) — считать свободный номер нужно по реальным картам, а не по пустой
// таблице Company.
export async function GET(): Promise<NextResponse> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const rows = await prisma.user.findMany({
    where: { cardNumber: { gte: '1000', lte: '9999' } },
    select: { cardNumber: true },
  })
  const taken = new Set(rows.map((r) => r.cardNumber).filter((c): c is string => c !== null))

  let candidate = 1000
  while (taken.has(String(candidate)) && candidate <= 9999) candidate++
  if (candidate > 9999) return NextResponse.json({ error: 'range_exhausted' }, { status: 409 })

  return NextResponse.json({ cardNumber: String(candidate) })
}
