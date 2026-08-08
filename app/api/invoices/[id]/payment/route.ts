import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getInvoiceById, recordPaymentInDb } from '@/lib/invoices-data-store'
import { getServerUser } from '@/lib/server-auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    // Recording a payment moves the invoice balance and can flip it to `paid`.
    // That must be a trusted action נadmin here, or a company-bound API key on
    // the /api/v1 path (bank reconciliation). A buyer must never self-attest payment.
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    const invoice = await getInvoiceById(id)
    if (!invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const payment = await req.json()
    const amount = Number(payment.amount)
    if (!Number.isFinite(amount) || amount <= 0 || typeof payment.method !== 'string' || !payment.method.trim()) {
      return NextResponse.json({ error: 'amount_method_required' }, { status: 400 })
    }
    if (amount > invoice.remainingAmount) {
      return NextResponse.json({ error: 'amount_exceeds_remaining' }, { status: 400 })
    }

    const updated = await recordPaymentInDb(id, { ...payment, amount, method: payment.method.trim() })
    return NextResponse.json({ invoice: updated })
  } catch (e) {
    logApiError("[invoices/:id/payment POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





