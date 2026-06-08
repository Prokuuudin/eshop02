import { NextRequest, NextResponse } from 'next/server'
import { getInvoicesByCompany, createInvoiceInDb } from '@/lib/invoices-data-store'
import { getServerUser } from '@/lib/server-auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId_required' }, { status: 400 })

    // Non-admins can only read their own company's invoices
    if (user.platformRole !== 'admin' && user.companyId !== companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const invoices = await getInvoicesByCompany(companyId)
    return NextResponse.json({ invoices })
  } catch (e) {
    console.error('[invoices GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    if (!body.id || !body.invoiceNumber || !body.companyId || !body.orderId) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    // Non-admins can only create invoices for their own company
    if (user.platformRole !== 'admin' && user.companyId !== body.companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const invoice = await createInvoiceInDb(body)
    return NextResponse.json({ invoice })
  } catch (e) {
    console.error('[invoices POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
