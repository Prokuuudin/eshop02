import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { getServerOrderById } from '@/lib/orders-data-store'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template
  )
}

async function sendOrderStatusEmail(
  orderId: string,
  status: 'shipped' | 'delivered'
): Promise<void> {
  const order = await getServerOrderById(orderId)
  if (!order?.email) return

  const lang = ((order as any).language ?? 'ru') as 'ru' | 'en' | 'lv'

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

  const firstName = (order as any).firstName ?? ''

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
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

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
    console.error('[admin/order-meta GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST /api/admin/order-meta — upsert status or note
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { orderId, status, note } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId_required' }, { status: 400 })

    if (status !== undefined) {
      await prisma.orderStatusRecord.upsert({
        where: { orderId },
        create: { orderId, status },
        update: { status },
      })

      if (status === 'shipped' || status === 'delivered') {
        sendOrderStatusEmail(orderId, status).catch(console.error)
      }
    }

    if (note !== undefined) {
      await prisma.orderNote.upsert({
        where: { orderId },
        create: { orderId, note },
        update: { note },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/order-meta POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
