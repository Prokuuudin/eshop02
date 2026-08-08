import { NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getServerUser } from '@/lib/server-auth'

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getServerUser({ allowPasswordChangeRequired: true })
    return NextResponse.json({ user })
  } catch (e) {
    logApiError("[auth/me]", e)
    return NextResponse.json({ user: null })
  }
}


