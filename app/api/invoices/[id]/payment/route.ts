import { NextRequest, NextResponse } from 'next/server'
import { getInvoiceById, recordPaymentInDb } from '@/lib/invoices-data-store'
import { getServerUser } from '@/lib/server-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Recording a payment moves the invoice balance and can flip it to `paid`.
    // That must be a trusted action — admin here, or a company-bound API key on
    // the /api/v1 path (bank reconciliation). A buyer must never self-attest payment.
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    const invoice = await getInvoiceById(id)
    if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

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
