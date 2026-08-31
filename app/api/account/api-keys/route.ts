import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, verifyPassword } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { generateCompanyApiKey, getCompanyApiKeyMeta, revokeCompanyApiKey } from '@/lib/company-api-keys'
import { guardOrigin } from '@/lib/api-guard'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

const canManageKeys = (user: { platformRole?: string; teamRole?: string | null }): boolean =>
  user.platformRole === 'admin' || user.teamRole === 'admin'

async function verifyStepUp(req: NextRequest, userId: string): Promise<boolean> {
  const body = await req.json().catch(() => null) as { currentPassword?: unknown } | null
  if (typeof body?.currentPassword !== 'string' || !body.currentPassword || body.currentPassword.length > 128) return false
  const credentials = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
  return credentials ? verifyPassword(body.currentPassword, credentials.passwordHash) : false
}

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!user.companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 })
    if (!canManageKeys(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const meta = await getCompanyApiKeyMeta(user.companyId)
    return NextResponse.json({ key: meta })
  } catch (e) {
    logApiError('[account/api-keys GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// Generating replaces any existing key for the company (single active key model) -
// the plaintext is returned once here and never stored or retrievable again.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!user.companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 })
    if (!canManageKeys(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (!await verifyStepUp(req, user.id)) return NextResponse.json({ error: 'reauthentication_failed' }, { status: 401 })

    const { plaintext, meta } = await generateCompanyApiKey(user.companyId)
    return NextResponse.json({ key: meta, plaintext })
  } catch (e) {
    logApiError('[account/api-keys POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!user.companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 })
    if (!canManageKeys(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (!await verifyStepUp(req, user.id)) return NextResponse.json({ error: 'reauthentication_failed' }, { status: 401 })

    const revoked = await revokeCompanyApiKey(user.companyId)
    return NextResponse.json({ revoked })
  } catch (e) {
    logApiError('[account/api-keys DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
