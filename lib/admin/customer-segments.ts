import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

export const CUSTOMER_SEGMENTS = ['vip', 'regular', 'new', 'inactive'] as const
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number]
export type CustomerSort = 'lastOrderDate' | 'totalSpent' | 'totalOrders' | 'email'
export type SortDirection = 'asc' | 'desc'

export interface CustomerRow {
  email: string
  firstName: string
  lastName: string
  totalOrders: number
  totalSpent: number
  lastOrderDate: string | null
  segment: CustomerSegment
}

export interface CustomerPage {
  customers: CustomerRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: Record<CustomerSegment, number>
}

type RawCustomer = {
  email: string
  firstName: string | null
  lastName: string | null
  totalOrders: bigint | number
  totalSpent: Prisma.Decimal | number
  lastOrderDate: Date | null
  segment: CustomerSegment
  filteredTotal: bigint | number
}

type RawCounts = Record<CustomerSegment, bigint | number>

export interface CustomerQuery {
  page: number
  pageSize: number
  search?: string
  email?: string
  segment?: CustomerSegment
  sort: CustomerSort
  direction: SortDirection
}

const aggregation = Prisma.sql`
  WITH aggregated AS (
    SELECT lower(trim(o.email)) AS "normalizedEmail",
      (array_agg(trim(o.email) ORDER BY o."createdAt" DESC))[1] AS email,
      (array_agg(o."firstName" ORDER BY o."createdAt" DESC))[1] AS "orderFirstName",
      (array_agg(o."lastName" ORDER BY o."createdAt" DESC))[1] AS "orderLastName",
      count(*)::bigint AS "totalOrders", coalesce(sum(o.total), 0) AS "totalSpent",
      max(o."createdAt") AS "lastOrderDate"
    FROM "Order" o
    WHERE trim(o.email) <> ''
    GROUP BY lower(trim(o.email))
  ), customers AS (
    SELECT a.email,
      coalesce(nullif(split_part(trim(u.name), ' ', 1), ''), a."orderFirstName") AS "firstName",
      coalesce(nullif(trim(substr(trim(u.name), length(split_part(trim(u.name), ' ', 1)) + 1)), ''), a."orderLastName") AS "lastName",
      a."totalOrders", a."totalSpent", a."lastOrderDate",
      CASE WHEN a."totalSpent" > 500 THEN 'vip'
        WHEN a."totalOrders" > 3 THEN 'regular'
        WHEN a."lastOrderDate" < now() - interval '180 days' THEN 'inactive'
        ELSE 'new' END AS segment
    FROM aggregated a
    LEFT JOIN "User" u ON lower(trim(u.email)) = a."normalizedEmail"
  )`

const orderBySql = (sort: CustomerSort, direction: SortDirection): Prisma.Sql => {
  const dir = direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const column = {
    email: Prisma.sql`email`, totalOrders: Prisma.sql`"totalOrders"`,
    totalSpent: Prisma.sql`"totalSpent"`, lastOrderDate: Prisma.sql`"lastOrderDate"`,
  }[sort]
  return Prisma.sql`${column} ${dir}, email ASC`
}

const filtersSql = (query: Pick<CustomerQuery, 'search' | 'email' | 'segment'>): Prisma.Sql => {
  const filters: Prisma.Sql[] = []
  if (query.email) filters.push(Prisma.sql`lower(trim(email)) = lower(trim(${query.email}))`)
  if (query.search) {
    const pattern = `%${query.search.trim()}%`
    filters.push(Prisma.sql`(email ILIKE ${pattern} OR "firstName" ILIKE ${pattern} OR "lastName" ILIKE ${pattern})`)
  }
  if (query.segment) filters.push(Prisma.sql`segment = ${query.segment}`)
  return filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty
}

export async function getCustomerPage(query: CustomerQuery): Promise<CustomerPage> {
  const where = filtersSql(query)
  const offset = (query.page - 1) * query.pageSize
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<RawCustomer[]>(Prisma.sql`${aggregation}
      SELECT *, count(*) OVER()::bigint AS "filteredTotal" FROM customers ${where}
      ORDER BY ${orderBySql(query.sort, query.direction)} LIMIT ${query.pageSize} OFFSET ${offset}`),
    prisma.$queryRaw<RawCounts[]>(Prisma.sql`${aggregation}
      SELECT count(*) FILTER (WHERE segment = 'vip')::bigint AS vip,
        count(*) FILTER (WHERE segment = 'regular')::bigint AS regular,
        count(*) FILTER (WHERE segment = 'new')::bigint AS new,
        count(*) FILTER (WHERE segment = 'inactive')::bigint AS inactive FROM customers`),
  ])
  const total = rows[0] ? Number(rows[0].filteredTotal) : 0
  const rawCounts = countRows[0] ?? { vip: 0, regular: 0, new: 0, inactive: 0 }
  return {
    customers: rows.map((row) => ({ email: row.email, firstName: row.firstName ?? '', lastName: row.lastName ?? '',
      totalOrders: Number(row.totalOrders), totalSpent: Number(row.totalSpent),
      lastOrderDate: row.lastOrderDate?.toISOString() ?? null, segment: row.segment })),
    total, page: query.page, pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    counts: { vip: Number(rawCounts.vip), regular: Number(rawCounts.regular), new: Number(rawCounts.new), inactive: Number(rawCounts.inactive) },
  }
}

export async function getCustomerRecipients(segment?: CustomerSegment, limit = 501) {
  const page = await getCustomerPage({ page: 1, pageSize: limit, segment, sort: 'email', direction: 'asc' })
  return page.customers.map(({ email, firstName, lastName }) => ({ email, firstName, lastName }))
}
