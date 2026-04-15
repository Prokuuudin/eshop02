import { NextResponse } from 'next/server'
import { getSiteContentOverridesFromStore } from '@/lib/site-content-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const overrides = await getSiteContentOverridesFromStore()
  return NextResponse.json(overrides)
}
