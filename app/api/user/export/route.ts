import { NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getServerUser } from '@/lib/server-auth'
import { exportUserData } from '@/lib/user-erasure'
import { createUserExportPdf } from '@/lib/user-export-pdf'

export const runtime = 'nodejs'

// GDPR Art. 15/20 נa readable report of the data held about the data subject.
export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const data = await exportUserData({ id: user.id, email: user.email })
    const exportDate = data.exportedAt.slice(0, 10)

    return new NextResponse(createUserExportPdf(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="hairshop-pro-my-account-report-${exportDate}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    logApiError("[user/export GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





