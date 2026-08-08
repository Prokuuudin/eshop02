import { NextRequest } from 'next/server'
import { logApiError } from '@/lib/observability'
import { authenticateRequest, successResponse, errorResponse, parsePagination } from '@/lib/api-helpers'
import { getInvoicesByCompany } from '@/lib/invoices-data-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    if (!auth.user.companyId) return errorResponse('Company context required', 400)

    const { page, limit, offset } = parsePagination(req)
    const { searchParams } = new URL(req.url)

    let invoices = await getInvoicesByCompany(auth.user.companyId)

    const status = searchParams.get('status')
    if (status) invoices = invoices.filter((inv) => inv.status === status)

    const sortBy = searchParams.get('sortBy') || 'date'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1
    invoices.sort((a, b) => {
      switch (sortBy) {
        case 'amount':
          return (a.total - b.total) * sortOrder
        case 'status':
          return a.status.localeCompare(b.status) * sortOrder
        default:
          return (new Date(a.issuedDate).getTime() - new Date(b.issuedDate).getTime()) * sortOrder
      }
    })

    const total = invoices.length
    const page_invoices = invoices.slice(offset, offset + limit)

    return successResponse({
      invoices: page_invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        orderId: inv.orderId,
        status: inv.status,
        issuedDate: inv.issuedDate,
        dueDate: inv.dueDate,
        paidDate: inv.paidDate,
        subtotal: inv.subtotal,
        tax: inv.taxAmount,
        total: inv.total,
        remaining: inv.remainingAmount,
        payments: inv.paymentRecords,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: {
        paidTotal: invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0),
        pendingTotal: invoices.filter((i) => i.status === 'issued').reduce((s, i) => s + i.remainingAmount, 0),
        overdueTotal: invoices
          .filter((i) => i.status === 'issued' && i.dueDate != null && new Date(i.dueDate) < new Date())
          .reduce((s, i) => s + i.remainingAmount, 0),
      },
    })
  } catch (error) {
    logApiError("API Error:", error)
    return errorResponse('Internal server error', 500)
  }
}


