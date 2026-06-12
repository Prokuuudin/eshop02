import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { upsertTemplate } from '@/lib/email-templates-server-store'

export const runtime = 'nodejs'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

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
