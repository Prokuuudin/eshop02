import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { exportUserData } from '@/lib/user-erasure'
import { createUserExportPdf } from '@/lib/user-export-pdf'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const gate = await requireAdminPermission('customers.export')
    if (gate instanceof NextResponse) return gate

    const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'email_required' }, { status: 400 })

    const customer = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, cardNumber: true },
    })
    if (!customer) return NextResponse.json({ error: 'account_not_found' }, { status: 404 })

    const data = await exportUserData({ id: customer.id, email: customer.email })
    const exportDate = data.exportedAt.slice(0, 10)
    const customerRef = (customer.cardNumber || customer.id).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)

    return new NextResponse(createUserExportPdf(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="hairshop-pro-client-${customerRef}-account-report-${exportDate}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logApiError("[admin/customers/export GET]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


