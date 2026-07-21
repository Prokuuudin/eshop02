import 'server-only'
import { prisma } from '@/lib/prisma'
import type { Invoice as PrismaInvoice } from '@/generated/prisma/client'
import type { Invoice, PaymentRecord } from '@/lib/invoices-store'
import { toNum } from '@/lib/decimal'

function mapDbToInvoice(row: PrismaInvoice): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    companyId: row.companyId,
    orderId: row.orderId,
    subtotal: toNum(row.subtotal),
    taxRate: row.taxRate,
    taxAmount: toNum(row.taxAmount),
    total: toNum(row.total),
    status: row.status as Invoice['status'],
    issuedDate: row.issuedDate,
    dueDate: row.dueDate,
    paidDate: row.paidDate ?? undefined,
    paymentRecords: (row.paymentRecords as unknown as PaymentRecord[]) ?? [],
    paidAmount: toNum(row.paidAmount),
    remainingAmount: toNum(row.remainingAmount),
    notes: row.notes ?? undefined,
    items: row.items as Invoice['items'],
  }
}

export async function getInvoicesByCompany(companyId: string): Promise<Invoice[]> {
  const rows = await prisma.invoice.findMany({
    where: { companyId },
    orderBy: { issuedDate: 'desc' },
  })
  return rows.map(mapDbToInvoice)
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const row = await prisma.invoice.findUnique({ where: { id } })
  return row ? mapDbToInvoice(row) : null
}

export async function getInvoiceByOrder(orderId: string): Promise<Invoice | null> {
  const row = await prisma.invoice.findFirst({ where: { orderId } })
  return row ? mapDbToInvoice(row) : null
}

export async function createInvoiceInDb(invoice: Omit<Invoice, 'paymentRecords' | 'paidAmount' | 'remainingAmount'> & { id: string }): Promise<Invoice> {
  const row = await prisma.invoice.create({
    data: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      companyId: invoice.companyId,
      orderId: invoice.orderId,
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      status: invoice.status,
      issuedDate: new Date(invoice.issuedDate),
      dueDate: new Date(invoice.dueDate),
      paidDate: invoice.paidDate ? new Date(invoice.paidDate) : null,
      paymentRecords: [],
      paidAmount: 0,
      remainingAmount: invoice.total,
      notes: invoice.notes ?? null,
      items: invoice.items ? (invoice.items as unknown as object[]) : undefined,
    },
  })
  return mapDbToInvoice(row)
}

export async function updateInvoiceInDb(id: string, updates: Partial<Invoice>): Promise<Invoice | null> {
  const existing = await prisma.invoice.findUnique({ where: { id } })
  if (!existing) return null

  const row = await prisma.invoice.update({
    where: { id },
    data: {
      status: updates.status ?? undefined,
      paidDate: updates.paidDate ? new Date(updates.paidDate) : undefined,
      notes: updates.notes ?? undefined,
      paidAmount: updates.paidAmount ?? undefined,
      remainingAmount: updates.remainingAmount ?? undefined,
      paymentRecords: updates.paymentRecords !== undefined
        ? (updates.paymentRecords as object[])
        : undefined,
    },
  })
  return mapDbToInvoice(row)
}

export async function recordPaymentInDb(invoiceId: string, payment: Omit<PaymentRecord, 'id' | 'date'>): Promise<Invoice | null> {
  const existing = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!existing) return null

  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const newRecord: PaymentRecord = { ...payment, id: paymentId, date: new Date() }

  const existingRecords = (existing.paymentRecords as unknown as PaymentRecord[]) ?? []
  const allRecords = [...existingRecords, newRecord]
  const paidAmount = toNum(existing.paidAmount) + payment.amount
  const remainingAmount = Math.max(0, toNum(existing.total) - paidAmount)
  const status = remainingAmount <= 0 ? 'paid' : existing.status

  const row = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paymentRecords: allRecords as object[],
      paidAmount,
      remainingAmount,
      status,
      paidDate: status === 'paid' ? new Date() : existing.paidDate,
    },
  })
  return mapDbToInvoice(row)
}
