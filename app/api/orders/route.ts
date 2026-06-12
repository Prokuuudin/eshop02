import { NextRequest, NextResponse } from 'next/server'
import { createOrUpdateServerOrder, type ServerOrder } from '@/lib/orders-data-store'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import { getServerUser } from '@/lib/server-auth'
import { recomputeOrderPricing } from '@/lib/server-pricing'

export const runtime = 'nodejs'

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template
  )
}

async function sendOrderConfirmationEmail(order: ServerOrder): Promise<void> {
  if (!order.email) return
  const lang = (['ru', 'en', 'lv'].includes(order.language ?? '') ? order.language : 'ru') as 'ru' | 'en' | 'lv'
  const templates = await getTemplates()
  const tpl =
    templates.find((t) => t.id === `order-confirmation-${lang}`) ??
    templates.find((t) => t.id === 'order-confirmation')
  const firstName = order.firstName ?? ''
  const total = typeof order.total === 'number' ? `€${order.total.toFixed(2)}` : String(order.total)
  const subjects: Record<string, string> = {
    ru: `Ваш заказ №${order.id} принят`,
    en: `Your order #${order.id} has been received`,
    lv: `Jūsu pasūtījums №${order.id} ir saņemts`,
  }
  let html: string
  if (tpl) {
    html = interpolate(tpl.body, { order_id: order.id, first_name: firstName, last_name: order.lastName ?? '', total, items_list: '' })
  } else {
    const bodies: Record<string, string> = {
      ru: `<h2>Здравствуйте, ${firstName}!</h2><p>Ваш заказ <strong>№${order.id}</strong> оформлен. Сумма: <strong>${total}</strong>.</p><p>Мы свяжемся с вами для подтверждения.</p>`,
      en: `<h2>Hello, ${firstName}!</h2><p>Your order <strong>#${order.id}</strong> has been placed. Total: <strong>${total}</strong>.</p><p>We will contact you to confirm the details.</p>`,
      lv: `<h2>Labdien, ${firstName}!</h2><p>Jūsu pasūtījums <strong>№${order.id}</strong> pieņemts. Summa: <strong>${total}</strong>.</p><p>Sazināsimies ar jums, lai apstiprinātu detaļas.</p>`,
    }
    html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">${bodies[lang]}</div>`
  }
  await sendEmail(order.email, subjects[lang], html)
}

export async function POST(req: NextRequest) {
  try {
    const { order } = (await req.json()) as { order?: ServerOrder }

    if (!order?.id) {
      return NextResponse.json({ error: 'order payload is required' }, { status: 400 })
    }

    const items = Array.isArray(order.items) ? order.items : []

    // Recompute all money fields from the authoritative DB catalog — never trust client prices/totals.
    // Bonus can only be spent by an authenticated user and is capped by their real DB balance.
    const caller = await getServerUser()
    const pricing = await recomputeOrderPricing({
      items: items.map((item) => ({ id: item.id, quantity: item.quantity, price: item.price })),
      promoCode: order.promoCode,
      deliveryMethod: order.deliveryMethod,
      bonusSpent: order.bonusSpent,
      userBonusBalance: caller ? caller.bonusPoints : null,
    })

    const correctedItems = items.map((item, idx) => ({
      ...item,
      price: pricing.items[idx]?.price ?? item.price,
      quantity: pricing.items[idx]?.quantity ?? item.quantity,
    }))

    const normalizedOrder: ServerOrder = {
      ...order,
      items: correctedItems,
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      tax: pricing.tax,
      delivery: pricing.delivery,
      bonusSpent: pricing.bonusSpent || undefined,
      total: pricing.total,
      promoCode: pricing.promoApplied ? order.promoCode : undefined,
      createdAt: order.createdAt || new Date().toISOString()
    }

    await createOrUpdateServerOrder(normalizedOrder)

    sendOrderConfirmationEmail(normalizedOrder).catch(console.error)

    return NextResponse.json({ success: true, orderId: normalizedOrder.id })
  } catch (error) {
    console.error('Orders API POST error:', error)
    return NextResponse.json({ error: 'Failed to persist order' }, { status: 500 })
  }
}
