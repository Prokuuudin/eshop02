import { NextRequest } from 'next/server'
import { getInvoiceById } from '@/app/api/v1/invoices/route'

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  return getInvoiceById(req, { params })
}
