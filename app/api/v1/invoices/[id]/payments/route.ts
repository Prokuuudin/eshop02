import { NextRequest } from 'next/server'
import { authenticateRequest, successResponse, errorResponse } from '@/lib/api-helpers'
import { useInvoicesStore } from '@/lib/invoices-store'
import { logAuditAction } from '@/lib/audit-log-store'
import { triggerCompanyWebhook } from '@/lib/webhook-sender'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    if (!auth.user.companyId) return errorResponse('Company context required', 400)
    if (!auth.user.apiAccess) return errorResponse('API key required', 403)

    const body = await req.json()
    const { amount, method, reference } = body

    if (!amount || amount <= 0) return errorResponse('Valid amount is required', 400)

    const invoicesStore = useInvoicesStore.getState()
    const invoice = invoicesStore.getInvoice(params.id)

    if (!invoice || invoice.companyId !== auth.user.companyId) {
      return errorResponse('Invoice not found', 404)
    }
    if (invoice.status !== 'issued') {
      return errorResponse('Can only record payments on issued invoices', 400)
    }

    invoicesStore.recordPayment(params.id, {
      amount,
      method: method || 'bank_transfer',
      reference: reference || `API-${Date.now()}`,
    })

    const updatedInvoice = invoicesStore.getInvoice(params.id)

    logAuditAction(auth.user.companyId, auth.user.id, 'payment_recorded', {
      source: 'api',
      invoiceId: params.id,
      amount,
      method,
    })

    await triggerCompanyWebhook(auth.user.companyId, 'payment.recorded', {
      invoiceId: params.id,
      invoiceNumber: invoice.invoiceNumber,
      amount,
      remainingAmount: updatedInvoice?.remainingAmount ?? 0,
      recordedAt: new Date().toISOString(),
    })

    return successResponse(
      {
        invoiceId: params.id,
        paymentRecorded: amount,
        remaining: updatedInvoice?.remainingAmount ?? 0,
        message: 'Payment recorded successfully',
      },
      201,
    )
  } catch (error) {
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}
