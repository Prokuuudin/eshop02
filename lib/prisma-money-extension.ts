import { Prisma } from '@/generated/prisma/client'
import { toNum } from './decimal'

/**
 * Money fields stored as Postgres `numeric` (Prisma `Decimal`) — every consumer in this
 * app has always worked with these as plain `number`. This extension converts them back
 * at the query boundary so nothing else has to change. Scope must match
 * docs/superpowers/specs/2026-07-20-money-decimal-storage-design.md exactly.
 */
export const MONEY_FIELDS_BY_MODEL: Record<string, string[]> = {
  Order: ['subtotal', 'tax', 'delivery', 'discount', 'total'],
  Invoice: ['subtotal', 'taxAmount', 'total', 'paidAmount', 'remainingAmount'],
  Company: ['creditLimit', 'usedCredit'],
  Product: ['price', 'oldPrice'],
  ProductSubscription: ['pricePerUnit'],
  ReturnRequest: ['refundAmount'],
}

export function convertMoneyFields(model: string, value: unknown): unknown {
  const fields = MONEY_FIELDS_BY_MODEL[model]
  if (!fields || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => convertMoneyFields(model, item))

  const row = value as Record<string, unknown>
  for (const field of fields) {
    if (row[field] instanceof Prisma.Decimal) {
      row[field] = toNum(row[field] as Prisma.Decimal)
    }
  }
  return row
}

export const moneyFieldsExtension = Prisma.defineExtension({
  name: 'moneyFieldsToNumber',
  query: {
    $allModels: {
      async $allOperations({ model, args, query }) {
        const result = await query(args)
        return model ? convertMoneyFields(model, result) : result
      },
    },
  },
})
