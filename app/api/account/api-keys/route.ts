import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { generateCompanyApiKey, getCompanyApiKeyMeta, revokeCompanyApiKey } from '@/lib/company-api-keys'
import { guardOrigin } from '@/lib/api-guard'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!user.companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 })

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

    const revoked = await revokeCompanyApiKey(user.companyId)
    return NextResponse.json({ revoked })
  } catch (e) {
    logApiError('[account/api-keys DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
