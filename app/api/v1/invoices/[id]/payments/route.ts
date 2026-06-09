import { NextRequest } from 'next/server'
import { authenticateRequest, successResponse, errorResponse } from '@/lib/api-helpers'
import { getInvoiceById, recordPaymentInDb } from '@/lib/invoices-data-store'
import { logAuditAction } from '@/lib/audit-log-store'
import { triggerCompanyWebhook } from '@/lib/webhook-sender'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    if (!auth.user.companyId) return errorResponse('Company context required', 400)
    if (!auth.user.apiAccess) return errorResponse('API key required', 403)

    const body = await req.json()
    const { amount, method, reference } = body
    if (!amount || amount <= 0) return errorResponse('Valid amount is required', 400)

    const invoice = await getInvoiceById(id)
    if (!invoice || invoice.companyId !== auth.user.companyId) return errorResponse('Invoice not found', 404)
    if (invoice.status !== 'issued') return errorResponse('Can only record payments on issued invoices', 400)

    const updated = await recordPaymentInDb(id, {
      amount,
      method: method || 'bank_transfer',
      reference: reference || `API-${Date.now()}`,
    })

    logAuditAction(auth.user.companyId, auth.user.id, 'payment_recorded', {
      source: 'api',
      invoiceId: id,
      amount,
      method,
    })

    await triggerCompanyWebhook(auth.user.companyId, 'payment.recorded', {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      amount,
      remainingAmount: updated?.remainingAmount ?? 0,
      recordedAt: new Date().toISOString(),
    })

    return successResponse(
      {
        invoiceId: id,
        paymentRecorded: amount,
        remaining: updated?.remainingAmount ?? 0,
        message: 'Payment recorded successfully',
      },
      201,
    )
  } catch (error) {
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}
