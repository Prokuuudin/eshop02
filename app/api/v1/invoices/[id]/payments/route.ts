import { NextRequest } from 'next/server'
import { recordPayment } from '@/app/api/v1/invoices/route'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  return recordPayment(req, { params })
}
