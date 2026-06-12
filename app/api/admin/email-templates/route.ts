import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { getTemplates } from '@/lib/email-templates-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const templates = await getTemplates()
    return NextResponse.json(templates)
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  }
}
