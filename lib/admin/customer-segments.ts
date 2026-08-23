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
  analytics: {
    previousCounts: Record<CustomerSegment, number>
    revenue: Record<CustomerSegment, number>
    becameVip: number
    becameInactive: number
    comparisonDays: number
  }
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
type RawAnalytics = {
  previousVip: bigint | number
  previousRegular: bigint | number
  previousNew: bigint | number
  previousInactive: bigint | number
  vipRevenue: Prisma.Decimal | number
  regularRevenue: Prisma.Decimal | number
  newRevenue: Prisma.Decimal | number
  inactiveRevenue: Prisma.Decimal | number
  becameVip: bigint | number
  becameInactive: bigint | number
}

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
  const [rows, countRows, analyticsRows] = await Promise.all([
    prisma.$queryRaw<RawCustomer[]>(Prisma.sql`${aggregation}
      SELECT *, count(*) OVER()::bigint AS "filteredTotal" FROM customers ${where}
      ORDER BY ${orderBySql(query.sort, query.direction)} LIMIT ${query.pageSize} OFFSET ${offset}`),
    prisma.$queryRaw<RawCounts[]>(Prisma.sql`${aggregation}
      SELECT count(*) FILTER (WHERE segment = 'vip')::bigint AS vip,
        count(*) FILTER (WHERE segment = 'regular')::bigint AS regular,
        count(*) FILTER (WHERE segment = 'new')::bigint AS new,
        count(*) FILTER (WHERE segment = 'inactive')::bigint AS inactive FROM customers`),
    prisma.$queryRaw<RawAnalytics[]>(Prisma.sql`
      WITH current_aggregated AS (
        SELECT lower(trim(email)) AS email, count(*)::bigint AS orders,
          coalesce(sum(total), 0) AS spent, max("createdAt") AS last_order
        FROM "Order" WHERE trim(email) <> '' GROUP BY lower(trim(email))
      ), previous_aggregated AS (
        SELECT lower(trim(email)) AS email, count(*)::bigint AS orders,
          coalesce(sum(total), 0) AS spent, max("createdAt") AS last_order
        FROM "Order"
        WHERE trim(email) <> '' AND "createdAt" <= now() - interval '30 days'
        GROUP BY lower(trim(email))
      ), compared AS (
        SELECT c.email, c.spent,
          CASE WHEN c.spent > 500 THEN 'vip' WHEN c.orders > 3 THEN 'regular'
            WHEN c.last_order < now() - interval '180 days' THEN 'inactive' ELSE 'new' END AS current_segment,
          CASE WHEN p.email IS NULL THEN NULL WHEN p.spent > 500 THEN 'vip' WHEN p.orders > 3 THEN 'regular'
            WHEN p.last_order < now() - interval '210 days' THEN 'inactive' ELSE 'new' END AS previous_segment
        FROM current_aggregated c LEFT JOIN previous_aggregated p ON p.email = c.email
      )
      SELECT
        count(*) FILTER (WHERE previous_segment = 'vip')::bigint AS "previousVip",
        count(*) FILTER (WHERE previous_segment = 'regular')::bigint AS "previousRegular",
        count(*) FILTER (WHERE previous_segment = 'new')::bigint AS "previousNew",
        count(*) FILTER (WHERE previous_segment = 'inactive')::bigint AS "previousInactive",
        coalesce(sum(spent) FILTER (WHERE current_segment = 'vip'), 0) AS "vipRevenue",
        coalesce(sum(spent) FILTER (WHERE current_segment = 'regular'), 0) AS "regularRevenue",
        coalesce(sum(spent) FILTER (WHERE current_segment = 'new'), 0) AS "newRevenue",
        coalesce(sum(spent) FILTER (WHERE current_segment = 'inactive'), 0) AS "inactiveRevenue",
        count(*) FILTER (WHERE current_segment = 'vip' AND previous_segment IS DISTINCT FROM 'vip')::bigint AS "becameVip",
        count(*) FILTER (WHERE current_segment = 'inactive' AND previous_segment IS DISTINCT FROM 'inactive')::bigint AS "becameInactive"
      FROM compared
    `),
  ])
  const total = rows[0] ? Number(rows[0].filteredTotal) : 0
  const rawCounts = countRows[0] ?? { vip: 0, regular: 0, new: 0, inactive: 0 }
  const analytics = analyticsRows[0] ?? {
    previousVip: 0, previousRegular: 0, previousNew: 0, previousInactive: 0,
    vipRevenue: 0, regularRevenue: 0, newRevenue: 0, inactiveRevenue: 0,
    becameVip: 0, becameInactive: 0,
  }
  return {
    customers: rows.map((row) => ({ email: row.email, firstName: row.firstName ?? '', lastName: row.lastName ?? '',
      totalOrders: Number(row.totalOrders), totalSpent: Number(row.totalSpent),
      lastOrderDate: row.lastOrderDate?.toISOString() ?? null, segment: row.segment })),
    total, page: query.page, pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    counts: { vip: Number(rawCounts.vip), regular: Number(rawCounts.regular), new: Number(rawCounts.new), inactive: Number(rawCounts.inactive) },
    analytics: {
      previousCounts: { vip: Number(analytics.previousVip), regular: Number(analytics.previousRegular), new: Number(analytics.previousNew), inactive: Number(analytics.previousInactive) },
      revenue: { vip: Number(analytics.vipRevenue), regular: Number(analytics.regularRevenue), new: Number(analytics.newRevenue), inactive: Number(analytics.inactiveRevenue) },
      becameVip: Number(analytics.becameVip), becameInactive: Number(analytics.becameInactive), comparisonDays: 30,
    },
  }
}

export async function getCustomerRecipients(segment?: CustomerSegment, limit = 501) {
  const page = await getCustomerPage({ page: 1, pageSize: limit, segment, sort: 'email', direction: 'asc' })
  return page.customers.map(({ email, firstName, lastName }) => ({ email, firstName, lastName }))
}
