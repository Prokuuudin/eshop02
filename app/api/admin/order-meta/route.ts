import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { getServerOrderById } from '@/lib/orders-data-store'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import { appendServerAudit } from '@/lib/server-audit'
import { z } from 'zod'

const orderStatusSchema = z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
type OrderStatus = z.infer<typeof orderStatusSchema>
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, escHtml(value)),
    template
  )
}

async function sendOrderStatusEmail(
  orderId: string,
  status: 'shipped' | 'delivered'
): Promise<void> {
  const order = await getServerOrderById(orderId)
  if (!order?.email) return

  const lang: 'ru' | 'en' | 'lv' =
    order.language === 'en' || order.language === 'lv' ? order.language : 'ru'

  const templates = await getTemplates()
  const templateId = status === 'shipped' ? 'order-shipped' : 'order-delivered'
  const tpl =
    templates.find((t) => t.id === `${templateId}-${lang}`) ??
    templates.find((t) => t.id === templateId)

  const subjects: Record<typeof status, Record<string, string>> = {
    shipped: {
      ru: `Ваш заказ №${orderId} отправлен`,
      en: `Your order #${orderId} has been shipped`,
      lv: `Jūsu pasūtījums №${orderId} ir nosūtīts`,
    },
    delivered: {
      ru: `Ваш заказ №${orderId} доставлен`,
      en: `Your order #${orderId} has been delivered`,
      lv: `Jūsu pasūtījums №${orderId} ir piegādāts`,
    },
  }

  const firstName = order.firstName ?? ''

  let html: string
  if (tpl) {
    html = interpolate(tpl.body, {
      order_id: orderId,
      first_name: firstName,
      tracking_number: '',
      delivery_date: '',
    })
  } else {
    const bodies: Record<typeof status, Record<string, string>> = {
      shipped: {
        ru: `<h2>Здравствуйте, ${firstName}!</h2><p>Ваш заказ <strong>№${orderId}</strong> передан в службу доставки.</p>`,
        en: `<h2>Hello, ${firstName}!</h2><p>Your order <strong>#${orderId}</strong> has been shipped.</p>`,
        lv: `<h2>Labdien, ${firstName}!</h2><p>Jūsu pasūtījums <strong>№${orderId}</strong> ir nodots piegādes dienestam.</p>`,
      },
      delivered: {
        ru: `<h2>Здравствуйте, ${firstName}!</h2><p>Ваш заказ <strong>№${orderId}</strong> доставлен. Спасибо за покупку!</p>`,
        en: `<h2>Hello, ${firstName}!</h2><p>Your order <strong>#${orderId}</strong> has been delivered. Thank you for your purchase!</p>`,
        lv: `<h2>Labdien, ${firstName}!</h2><p>Jūsu pasūtījums <strong>№${orderId}</strong> ir piegādāts. Paldies par pirkumu!</p>`,
      },
    }
    html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">${bodies[status][lang]}</div>`
  }

  await sendEmail(order.email, subjects[status][lang], html)
}

// GET /api/admin/order-meta?ids=id1,id2,...
// Returns statuses and notes for given order IDs
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await requireAdminPermission('orders.read')
    if (user instanceof NextResponse) return user

    const idsParam = req.nextUrl.searchParams.get('ids') || ''
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200)

    if (ids.length === 0) return NextResponse.json({ statuses: {}, notes: {} })

    const [statusRows, noteRows] = await Promise.all([
      prisma.orderStatusRecord.findMany({ where: { orderId: { in: ids } } }),
      prisma.orderNote.findMany({ where: { orderId: { in: ids } } }),
    ])

    const statuses: Record<string, string> = {}
    for (const row of statusRows) statuses[row.orderId] = row.status

    const notes: Record<string, string> = {}
    for (const row of noteRows) notes[row.orderId] = row.note

    return NextResponse.json({ statuses, notes })
  } catch (e) {
    logApiError("[admin/order-meta GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST /api/admin/order-meta — upsert status or note
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await requireAdminPermission('orders.update')
    if (user instanceof NextResponse) return user

    const parsed = z.object({
      orderId: z.string().trim().min(1).max(100),
      status: orderStatusSchema.optional(),
      note: z.string().max(10_000).optional(),
    }).safeParse(await req.json().catch(() => null))
    if (!parsed.success || (parsed.data.status === undefined && parsed.data.note === undefined)) {
      return NextResponse.json({ error: 'invalid_order_meta' }, { status: 400 })
    }
    const { orderId, status, note } = parsed.data

    if (status !== undefined) {
      const transition = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { id: true, firstName: true, lastName: true, items: true, paymentStatus: true, stockReservationStatus: true },
        })
        if (!order) return { error: 'order_not_found' as const }
        const currentRow = await tx.orderStatusRecord.findUnique({ where: { orderId } })
        const currentResult = orderStatusSchema.safeParse(currentRow?.status ?? 'pending')
        if (!currentResult.success) return { error: 'invalid_current_status' as const }
        const current = currentResult.data
        if (current !== status && !ALLOWED_TRANSITIONS[current].includes(status)) {
          return { error: 'invalid_status_transition' as const, current }
        }
        if (current === status) return { current }
        if (status === 'cancelled') {
          if (order.paymentStatus === 'paid') return { error: 'paid_order_requires_refund' as const, current }
          if (order.stockReservationStatus !== 'released') {
            for (const item of order.items as Array<{ id?: string; quantity?: number }>) {
              if (item.id && Number.isInteger(item.quantity) && Number(item.quantity) > 0) {
                await tx.product.updateMany({
                  where: { id: item.id, isDeleted: false },
                  data: { stock: { increment: Number(item.quantity) } },
                })
              }
            }
            await tx.order.update({
              where: { id: orderId },
              data: { stockReservationStatus: 'released', stockReleasedAt: new Date(), stockReservedUntil: null },
            })
          }
        }
        await tx.orderStatusRecord.upsert({
          where: { orderId },
          create: { orderId, status },
          update: { status },
        })
        await appendServerAudit(tx, req, user, {
            action: 'order.status_changed', entityType: 'order', entityId: orderId,
            entityTitle: `${order.firstName} ${order.lastName}`.trim(),
            before: { status: current },
            after: { status },
        })
        return { current }
      })
      if ('error' in transition) {
        return NextResponse.json(transition, { status: transition.error === 'order_not_found' ? 404 : 409 })
      }

      if (status === 'shipped' || status === 'delivered') {
        try {
          await sendOrderStatusEmail(orderId, status)
        } catch (emailError) {
          logApiError("[admin/order-meta status email]", emailError)
          return NextResponse.json({ ok: true, warning: 'status_saved_email_failed' }, { status: 202 })
        }
      }
    }

    if (note !== undefined) {
      const saved = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, firstName: true, lastName: true } })
        if (!order) return false
        const previous = await tx.orderNote.findUnique({ where: { orderId } })
        await tx.orderNote.upsert({ where: { orderId }, create: { orderId, note }, update: { note } })
        await appendServerAudit(tx, req, user, {
            action: 'order.note_saved', entityType: 'order', entityId: orderId,
            entityTitle: `${order.firstName} ${order.lastName}`.trim(),
            before: { note: previous?.note ?? null }, after: { note },
        })
        return true
      })
      if (!saved) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError("[admin/order-meta POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





