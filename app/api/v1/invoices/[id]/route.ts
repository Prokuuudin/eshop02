import { NextRequest } from 'next/server'
import { authenticateRequest, successResponse, errorResponse } from '@/lib/api-helpers'
import { getInvoiceById } from '@/lib/invoices-data-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    if (!auth.user.companyId) return errorResponse('Company context required', 400)

    const invoice = await getInvoiceById(id)
    if (!invoice || invoice.companyId !== auth.user.companyId) {
      return errorResponse('Invoice not found', 404)
    }

    return successResponse({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderId,
        status: invoice.status,
        issuedDate: invoice.issuedDate,
        dueDate: invoice.dueDate,
        paidDate: invoice.paidDate,
        subtotal: invoice.subtotal,
        tax: invoice.taxAmount,
        total: invoice.total,
        remaining: invoice.remainingAmount,
        payments: invoice.paymentRecords,
        notes: invoice.notes,
      },
    })
  } catch (error) {
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}
