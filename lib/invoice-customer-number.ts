import 'server-only'

import { prisma } from '@/lib/prisma'

type InvoicePayerOrder = {
  id: string
  userId?: string | null
  companyId?: string | null
  legalDetails?: unknown
}

function isCompanyPayer(legalDetails: unknown): boolean {
  return typeof legalDetails === 'object'
    && legalDetails !== null
    && 'customerType' in legalDetails
    && legalDetails.customerType === 'company'
}

/** Resolves the current Hairshop Pro card number for the legal payer of each order. */
export async function getInvoiceCustomerNumbers(
  orders: readonly InvoicePayerOrder[]
): Promise<Record<string, string>> {
  const individualOrders = orders.filter((order) => !isCompanyPayer(order.legalDetails))
  const companyOrders = orders.filter((order) => isCompanyPayer(order.legalDetails))
  const userIds = [...new Set(individualOrders.map((order) => order.userId).filter((id): id is string => Boolean(id)))]
  const companyIds = [...new Set(companyOrders.map((order) => order.companyId).filter((id): id is string => Boolean(id)))]

  const [users, companies] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, cardNumber: true } })
      : [],
    companyIds.length > 0
      ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, cardNumber: true } })
      : [],
  ])
  const userCards = new Map(users.map((user) => [user.id, user.cardNumber?.trim() || undefined]))
  const companyCards = new Map(companies.map((company) => [company.id, company.cardNumber?.trim() || undefined]))

  return Object.fromEntries(orders.flatMap((order) => {
    const customerNumber = isCompanyPayer(order.legalDetails)
      ? companyCards.get(order.companyId ?? '')
      : userCards.get(order.userId ?? '')
    return customerNumber ? [[order.id, customerNumber]] : []
  }))
}
