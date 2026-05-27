import { NextRequest, NextResponse } from 'next/server'
import { getTemplates } from '@/lib/email-templates-server-store'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const templates = await getTemplates()
    return NextResponse.json(templates)
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 })
  }
}
