import { NextRequest, NextResponse } from 'next/server'
import { getInvoiceById, recordPaymentInDb } from '@/lib/invoices-data-store'
import { getServerUser } from '@/lib/server-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const invoice = await getInvoiceById(id)
    if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (user.platformRole !== 'admin' && invoice.companyId !== user.companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const payment = await req.json()
    if (!payment.amount || !payment.method) {
      return NextResponse.json({ error: 'amount_method_required' }, { status: 400 })
    }

    const updated = await recordPaymentInDb(id, payment)
    return NextResponse.json({ invoice: updated })
  } catch (e) {
    console.error('[invoices/:id/payment POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
