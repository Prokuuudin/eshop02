import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { hasAdminPermission } from '@/lib/admin-permissions'
import { parseOffsetPagination } from '@/lib/pagination'
import { recordCompanyActivity } from '@/lib/company-activity-log'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'

const rfqItemSchema = z.object({
  productId: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(1_000_000),
}).strict()
const rfqBodySchema = z.object({
  id: z.string().trim().min(1).max(200),
  companyId: z.string().trim().min(1).max(200).optional(),
  items: z.array(rfqItemSchema).min(1).max(500),
  notes: z.string().max(5_000).optional(),
}).strict()

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const { skip, take } = parseOffsetPagination(searchParams)

    const where = hasAdminPermission(user, 'rfq.read')
      ? {}
      : user.companyId
        ? { companyId: user.companyId }
        : { companyId: '__none__' }

    const [requests, total] = await Promise.all([
      prisma.rFQRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.rFQRequest.count({ where }),
    ])

    const companyIds = [...new Set(requests.map((request) => request.companyId))]
    const productIds = [...new Set(requests.flatMap((request) => (
      Array.isArray(request.items) ? (request.items as Array<{ productId?: string }>).map((item) => item.productId).filter((id): id is string => Boolean(id)) : []
    )))]
    const [companies, products] = await Promise.all([
      companyIds.length ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, companyName: true, contactEmail: true, contactPhone: true } }) : [],
      productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, title: true, sku: true, price: true } }) : [],
    ])
    const companyById = new Map(companies.map((company) => [company.id, company]))
    const productById = new Map(products.map((product) => [product.id, product]))
    const isStaff = hasAdminPermission(user, 'rfq.read')

    return NextResponse.json({
      requests: requests.map((r) => ({
        ...r,
        items: (Array.isArray(r.items) ? r.items as Array<Record<string, unknown>> : []).map((item) => {
          const product = productById.get(String(item.productId ?? ''))
          return { ...item, title: item.title ?? product?.title, sku: item.sku ?? product?.sku, listPrice: item.listPrice ?? product?.price }
        }),
        ...(isStaff ? {
          companyName: companyById.get(r.companyId)?.companyName,
          contactEmail: companyById.get(r.companyId)?.contactEmail,
          contactPhone: companyById.get(r.companyId)?.contactPhone,
        } : {}),
        timeline: isStaff ? r.timeline : (Array.isArray(r.timeline) ? r.timeline.filter((event) => !(event as { internal?: boolean })?.internal) : []),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
    })
  } catch (e) {
    logApiError("[rfq GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const parsed = rfqBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_rfq_body' }, { status: 400 })
    }
    const { id, companyId, items, notes } = parsed.data

    // Non-admins can only create for their own company
    const resolvedCompanyId = hasAdminPermission(user, 'rfq.quote')
      ? (companyId ?? user.companyId ?? '')
      : (user.companyId ?? '')

    if (!resolvedCompanyId) {
      return NextResponse.json({ error: 'company_required' }, { status: 400 })
    }

    // The id is client-supplied (offline-first retry pattern). Never let a
    // colliding id upsert into - or read back - another company's RFQ,
    // including its quote pricing.
    const existing = await prisma.rFQRequest.findUnique({ where: { id } })
    if (existing) {
      if (existing.companyId !== resolvedCompanyId && !hasAdminPermission(user, 'rfq.read')) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
      return NextResponse.json({
        request: { ...existing, createdAt: existing.createdAt.toISOString(), updatedAt: existing.updatedAt.toISOString() },
      })
    }

    const quantities = new Map<string, number>()
    for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
    const products = await prisma.product.findMany({
      where: { id: { in: [...quantities.keys()] }, isDeleted: false, isActive: true },
      select: { id: true, title: true, sku: true, price: true },
    })
    if (products.length !== quantities.size) return NextResponse.json({ error: 'rfq_product_not_found' }, { status: 400 })
    const persistedItems = products.map((product) => ({
      productId: product.id, quantity: quantities.get(product.id)!, title: product.title,
      sku: product.sku ?? undefined, listPrice: product.price,
    }))

    let rfq
    try {
      rfq = await prisma.rFQRequest.create({
        data: {
          id,
          companyId: resolvedCompanyId,
          items: persistedItems,
          notes: notes ?? '',
          status: 'pending',
          timeline: [{ at: new Date().toISOString(), type: 'created' }] as unknown as Prisma.InputJsonValue,
          createdByUserId: user.id,
        },
      })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        const race = await prisma.rFQRequest.findUniqueOrThrow({ where: { id } })
        if (race.companyId !== resolvedCompanyId && !hasAdminPermission(user, 'rfq.read')) {
          return NextResponse.json({ error: 'forbidden' }, { status: 403 })
        }
        rfq = race
      } else {
        throw e
      }
    }

    if (user.auditLoggingEnabled) {
      recordCompanyActivity({
        companyId: resolvedCompanyId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        action: 'rfq_created',
        details: { rfqId: rfq.id, items: persistedItems.length },
      }).catch((err) => logApiError('[rfq POST] activity log failed', err))
    }

    try {
      const staff = await prisma.user.findMany({
        where: { OR: [{ platformRole: 'admin' }, { teamRole: 'manager' }] },
        select: { id: true },
      })
      if (staff.length) {
        await prisma.userNotification.createMany({
          data: [...new Set(staff.map((row) => row.id))].map((userId) => ({
            userId, type: 'rfq', title: 'Новая RFQ-заявка',
            message: `Компания ${resolvedCompanyId} отправила запрос ${rfq.id}.`, link: '/admin/rfq',
          })),
        })
      }
    } catch (notificationError) {
      logApiError('[rfq POST] notification failed', notificationError)
    }

    return NextResponse.json({
      request: { ...rfq, createdAt: rfq.createdAt.toISOString(), updatedAt: rfq.updatedAt.toISOString() },
    })
  } catch (e) {
    logApiError("[rfq POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


