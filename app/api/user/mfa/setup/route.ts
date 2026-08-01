import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { generateTotpSecret, buildOtpauthUri, encryptSecret } from '@/lib/mfa'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

// POST /api/user/mfa/setup — start (or restart) TOTP enrollment for the signed-in admin.
// Stores an encrypted pending secret; mfaEnabled stays false until /confirm verifies a code
// against it, so an abandoned setup never grants a working second factor.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const secret = generateTotpSecret()
  const uri = buildOtpauthUri(user.email, secret)
  const qrCodeDataUrl = await QRCode.toDataURL(uri)

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: encryptSecret(secret) },
  })

  return NextResponse.json({ secret, qrCodeDataUrl })
}
