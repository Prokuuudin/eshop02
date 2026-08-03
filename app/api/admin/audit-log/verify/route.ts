import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { verifyAuditIntegrity } from '@/lib/server-audit'

export async function GET(): Promise<Response> {
  const actor = await requireAdminPermission('audit.read')
  if (actor instanceof NextResponse) return actor
  const rows = await prisma.auditLog.findMany({ orderBy: { sequence: 'asc' } })
  const result = verifyAuditIntegrity(rows)
  return NextResponse.json(result, { status: result.valid ? 200 : 409 })
}
