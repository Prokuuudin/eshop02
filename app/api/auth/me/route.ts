import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'

export async function GET() {
  try {
    const user = await getServerUser()
    return NextResponse.json({ user })
  } catch (e) {
    console.error('[auth/me]', e)
    return NextResponse.json({ user: null })
  }
}
