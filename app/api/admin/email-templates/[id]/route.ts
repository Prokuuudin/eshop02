import { NextRequest, NextResponse } from 'next/server'
import { upsertTemplate } from '@/lib/email-templates-server-store'

export const runtime = 'nodejs'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const result = await upsertTemplate(id, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error === 'not_found' ? 404 : 500 })
    }
    return NextResponse.json(result.template)
  } catch {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
}
