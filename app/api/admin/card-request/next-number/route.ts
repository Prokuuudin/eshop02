import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { getRevokedCardPolicy, isRevokedCardPolicyError } from '@/lib/revoked-card-policy'

export const runtime = 'nodejs'

// Короткие карты мастеров (без предъявленной физической карты) живут в том же
// поле User.cardNumber, что и импортированные карты клиентов (4-значные, ~10k
// занято) — считать свободный номер нужно по реальным картам, а не по пустой
// таблице Company.
export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminPermission('customers.read')
  if (gate instanceof NextResponse) return gate

  try {
    const [rows, policy] = await Promise.all([
      prisma.user.findMany({
        where: { cardNumber: { gte: '1000', lte: '9999' } },
        select: { cardNumber: true },
      }),
      getRevokedCardPolicy(),
    ])
    const taken = new Set([
      ...rows.map((r) => r.cardNumber).filter((c): c is string => c !== null),
      ...policy.cardNumbers,
    ])

    let candidate = 1000
    while (taken.has(String(candidate)) && candidate <= 9999) candidate++
    if (candidate > 9999) return NextResponse.json({ error: 'range_exhausted' }, { status: 409 })

    return NextResponse.json({ cardNumber: String(candidate) })
  } catch (error) {
    if (isRevokedCardPolicyError(error)) {
      return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
    }
    throw error
  }
}
