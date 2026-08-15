import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { upsertTemplate } from '@/lib/email-templates-server-store'

export const runtime = 'nodejs'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    const body = (await request.json()) as Record<string, unknown>
    if (
      (body.name !== undefined && typeof body.name !== 'string') ||
      (body.subject !== undefined && typeof body.subject !== 'string') ||
      (body.body !== undefined && typeof body.body !== 'string') ||
      (body.variables !== undefined && (!Array.isArray(body.variables) || body.variables.some((v) => typeof v !== 'string')))
    ) {
      return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
    }
    const updates = Object.fromEntries(
      Object.entries(body).filter(([key]) => ['name', 'subject', 'body', 'variables'].includes(key)),
    )
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'no_allowed_fields' }, { status: 400 })
    }
    const result = await upsertTemplate(id, updates)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error === 'not_found' ? 404 : 500 })
    }
    return NextResponse.json(result.template)
  } catch {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
}
