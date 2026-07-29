import { NextRequest, NextResponse } from 'next/server'
import { getInvoiceById, updateInvoiceInDb } from '@/lib/invoices-data-store'
import { getServerUser } from '@/lib/server-auth'

// Fields a non-admin may update on their own invoice. `status` is deliberately
// excluded — a buyer must not be able to set their own invoice to `paid`/`cancelled`.
const ALLOWED_UPDATE_FIELDS = new Set(['notes'])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const invoice = await getInvoiceById(id)
    if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (user.platformRole !== 'admin' && invoice.companyId !== user.companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    return NextResponse.json({ invoice })
  } catch (e) {
    console.error('[invoices/:id GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const invoice = await getInvoiceById(id)
    if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (user.platformRole !== 'admin' && invoice.companyId !== user.companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const rawUpdates = await req.json()

    // Non-admins restricted to safe fields only
    const updates = user.platformRole === 'admin'
      ? rawUpdates
      : Object.fromEntries(
          Object.entries(rawUpdates).filter(([k]) => ALLOWED_UPDATE_FIELDS.has(k))
        )

    const updated = await updateInvoiceInDb(id, updates)
    return NextResponse.json({ invoice: updated })
  } catch (e) {
    console.error('[invoices/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
