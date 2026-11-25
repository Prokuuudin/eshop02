import { NextRequest, NextResponse } from 'next/server'
import { isAccountOwnerMissing, lockAccountOwner } from '@/lib/account-owner-lock'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { randomBytes } from 'node:crypto'

const ALLOWED_MEMBER_ROLES = new Set(['viewer', 'buyer', 'manager'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id: companyId } = await params
    const { userId, email, role, name } = await req.json()

    if (!userId || !email || !name) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    const memberRole = role ?? 'viewer'
    if (!ALLOWED_MEMBER_ROLES.has(memberRole)) {
      return NextResponse.json({ error: 'invalid_role' }, { status: 400 })
    }

    // CompanyMember.userId and .addedBy have no foreign key: lock both accounts (lib/account-owner-lock).
    const member = await prisma.$transaction(async (tx) => {
      for (const id of [...new Set([userId, user.id])].sort()) await lockAccountOwner(tx, id)
      return tx.companyMember.upsert({
        where: { companyId_userId: { companyId, userId } },
        create: {
          id: `cm_${randomBytes(8).toString('hex')}`,
          companyId,
          userId,
          email,
          role: memberRole,
          name,
          addedBy: user.id,
        },
        update: { role: memberRole, name, email },
      })
    })

    return NextResponse.json({ member })
  } catch (e) {
    if (isAccountOwnerMissing(e)) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    logApiError("[companies/:id/members POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

