import { NextRequest } from 'next/server'
import { authenticateRequest, successResponse, errorResponse, parsePagination } from '@/lib/api-helpers'
import { useInvoicesStore } from '@/lib/invoices-store'

/**
 * GET /api/v1/invoices
 * Returns paginated list of company invoices
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - status: string (optional) - issued, paid, overdue, draft, cancelled
 * - sortBy: string (optional) - date, amount, status
 * - sortOrder: asc|desc (optional, default: desc)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req)
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
    }

    if (!auth.user.companyId) {
      return errorResponse('Company context required', 400)
    }

    const { page, limit, offset } = parsePagination(req)
    const { searchParams } = new URL(req.url)

    const invoicesStore = useInvoicesStore.getState()
    let invoices = Array.from(invoicesStore.invoices.values()).filter((inv) => inv.companyId === auth.user.companyId)

    // Filter by status
    const status = searchParams.get('status')
    if (status) {
      invoices = invoices.filter(inv => inv.status === status)
    }

    // Sort
    const sortBy = searchParams.get('sortBy') || 'date'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1

    invoices.sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case 'amount':
          aVal = a.total || 0
          bVal = b.total || 0
          break
        case 'status':
          aVal = (a.status || '').localeCompare(b.status || '')
          return aVal * sortOrder
        case 'date':
        default:
          aVal = new Date(a.issuedDate).getTime()
          bVal = new Date(b.issuedDate).getTime()
      }
      return (aVal - bVal) * sortOrder
    })

    const total = invoices.length
    const paginatedInvoices = invoices.slice(offset, offset + limit)

    return successResponse({
      invoices: paginatedInvoices.map(inv => ({
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
        payments: inv.paymentRecords
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      summary: {
        paidTotal: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total, 0),
        pendingTotal: invoices.filter(i => i.status === 'issued').reduce((sum, i) => sum + i.remainingAmount, 0),
        overdueTotal: invoices.filter(i => i.status === 'issued' && new Date(i.dueDate) < new Date()).reduce((sum, i) => sum + i.remainingAmount, 0)
      }
    })
  } catch (error) {
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}

