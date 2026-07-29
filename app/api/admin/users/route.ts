import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const caller = await getServerUser()
    if (!caller || caller.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const role = searchParams.get('role') || ''
    const companyId = searchParams.get('companyId') || ''
    const skip = Math.max(0, parseInt(searchParams.get('skip') || '0', 10) || 0)
    const take = Math.min(100, Math.max(1, parseInt(searchParams.get('take') || '50', 10) || 50))

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { cardNumber: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (role) where.platformRole = role
    if (companyId) where.companyId = companyId

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          platformRole: true,
          companyId: true,
          companyName: true,
          teamRole: true,
          phone: true,
          cardNumber: true,
          avatarUrl: true,
          bonusPoints: true,
          approvalRequired: true,
          auditLoggingEnabled: true,
          mustChangePassword: true,
          createdAt: true,
          // Never expose passwordHash
        },
      }),
      prisma.user.count({ where }),
    ])

    const mapped = users.map((u) => ({
      ...u,
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
    }))

    return NextResponse.json({ users: mapped, total })
  } catch (e) {
    console.error('[admin/users GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  try {
    const caller = await getServerUser()
    if (!caller || caller.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id, ...updates } = await req.json()
    if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

    // Whitelist fields admin may update
    const allowed: Record<string, unknown> = {}
    const allowed_fields = [
      'name', 'platformRole', 'companyId', 'companyName', 'teamRole',
      'phone', 'cardNumber', 'avatarUrl', 'bonusPoints',
      'approvalRequired', 'auditLoggingEnabled', 'mustChangePassword',
    ]
    for (const field of allowed_fields) {
      if (field in updates) allowed[field] = updates[field]
    }

    const user = await prisma.user.update({
      where: { id: String(id) },
      data: allowed,
      select: { id: true, email: true, name: true, platformRole: true, bonusPoints: true, companyId: true },
    })

    return NextResponse.json({ user })
  } catch (e) {
    console.error('[admin/users PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
