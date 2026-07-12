import { NextRequest, NextResponse } from 'next/server'
import { createServerOrder, type ServerOrder } from '@/lib/orders-data-store'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import { getServerUser } from '@/lib/server-auth'
import { recomputeOrderPricing } from '@/lib/server-pricing'
import { stores } from '@/data/stores'

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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const DELIVERY_LABELS_RU: Record<string, string> = {
  courier: 'Курьер',
  pickup: 'Самовывоз',
  post: 'Пакоматы Omniva',
}

async function sendAdminOrderNotificationEmail(order: ServerOrder, pickupStoreLabel?: string): Promise<void> {
  const adminEmail = process.env.CONTACT_TO
  if (!adminEmail) return

  // Admin notification is intentionally in Russian regardless of order.language
  const date = new Date(order.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Riga' })
  const items = Array.isArray(order.items) ? order.items : []

  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:4px 8px">${escHtml(item.title ?? '—')}</td>
          <td style="padding:4px 8px;text-align:center">${item.quantity ?? 1}</td>
          <td style="padding:4px 8px;text-align:right">€${(item.price ?? 0).toFixed(2)}</td>
          <td style="padding:4px 8px;text-align:right">€${((item.price ?? 0) * (item.quantity ?? 1)).toFixed(2)}</td>
        </tr>`
    )
    .join('')

  const discountRow =
    order.discount > 0
      ? `<tr><td colspan="3" style="padding:4px 8px;text-align:right;color:#6b7280">Скидка</td><td style="padding:4px 8px;text-align:right">−€${order.discount.toFixed(2)}</td></tr>`
      : ''

  const html = `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px">
  <h2 style="margin-top:0">Новый заказ №${escHtml(order.id)}</h2>
  <p style="color:#6b7280;margin-top:-8px">${date}</p>

  <h3>Покупатель</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:4px 8px;color:#6b7280;width:120px">Имя</td><td style="padding:4px 8px">${escHtml(order.firstName ?? '')} ${escHtml(order.lastName ?? '')}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Email</td><td style="padding:4px 8px">${escHtml(order.email ?? '')}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Телефон</td><td style="padding:4px 8px">${escHtml(order.phone ?? '—')}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Адрес</td><td style="padding:4px 8px">${escHtml(order.address ?? '')}, ${escHtml(order.city ?? '')}${order.postalCode ? ', ' + escHtml(order.postalCode) : ''}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Доставка</td><td style="padding:4px 8px">${escHtml(DELIVERY_LABELS_RU[order.deliveryMethod] ?? order.deliveryMethod ?? '—')}</td></tr>
    ${pickupStoreLabel ? `<tr><td style="padding:4px 8px;color:#6b7280">Магазин</td><td style="padding:4px 8px">${escHtml(pickupStoreLabel)}</td></tr>` : ''}
    <tr><td style="padding:4px 8px;color:#6b7280">Оплата</td><td style="padding:4px 8px">${escHtml(order.paymentMethod ?? '—')}</td></tr>
  </table>

  <h3>Товары</h3>
  <table style="border-collapse:collapse;width:100%">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="padding:4px 8px;text-align:left;font-weight:600">Товар</th>
        <th style="padding:4px 8px;text-align:center;font-weight:600">Кол.</th>
        <th style="padding:4px 8px;text-align:right;font-weight:600">Цена</th>
        <th style="padding:4px 8px;text-align:right;font-weight:600">Итого</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr><td colspan="3" style="padding:4px 8px;text-align:right;color:#6b7280">Доставка</td><td style="padding:4px 8px;text-align:right">€${(order.delivery ?? 0).toFixed(2)}</td></tr>
      ${discountRow}
      <tr style="font-weight:bold;border-top:2px solid #e5e7eb">
        <td colspan="3" style="padding:8px 8px 4px;text-align:right">ИТОГО</td>
        <td style="padding:8px 8px 4px;text-align:right">€${(order.total ?? 0).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
</div>`

  await sendEmail(
    adminEmail,
    `Новый заказ №${escHtml(order.id)} — ${escHtml(order.firstName ?? '')} ${escHtml(order.lastName ?? '')} — €${(order.total ?? 0).toFixed(2)}`,
    html
  )
}

export async function POST(req: NextRequest) {
  try {
    const { order } = (await req.json()) as { order?: ServerOrder }

    if (!order) {
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

    // The id is server-generated: per-browser client counters collide across customers,
    // and accepting a client id would let anyone overwrite a foreign order.
    const { id: ignoredClientId, ...orderFields } = order
    void ignoredClientId

    // Самовывоз: в схеме Order нет колонки под магазин, поэтому адресом доставки
    // становится адрес выбранного магазина (клиентский адрес для pickup не нужен).
    const pickupStore =
      order.deliveryMethod === 'pickup'
        ? stores.find((s) => s.id === order.pickupStoreId)
        : undefined
    const pickupAddressPatch = pickupStore
      ? { address: `${pickupStore.name.ru} — ${pickupStore.address.ru}`, city: pickupStore.city.ru }
      : {}

    const normalizedOrder: Omit<ServerOrder, 'id'> = {
      ...orderFields,
      ...pickupAddressPatch,
      items: correctedItems,
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      tax: pricing.tax,
      delivery: pricing.delivery,
      bonusSpent: pricing.bonusSpent || undefined,
      bonusEarned: pricing.bonusEarned || undefined,
      total: pricing.total,
      promoCode: pricing.promoApplied ? order.promoCode : undefined,
      // Bind the order to the authenticated user/company at creation for reliable ownership checks.
      userId: caller?.id,
      companyId: caller?.companyId,
      createdAt: order.createdAt || new Date().toISOString()
    }

    const created = await createServerOrder(normalizedOrder)

    sendOrderConfirmationEmail(created).catch(console.error)
    sendAdminOrderNotificationEmail(
      created,
      pickupStore ? `${pickupStore.name.ru} — ${pickupStore.address.ru}` : undefined
    ).catch(console.error)

    return NextResponse.json({ success: true, orderId: created.id })
  } catch (error) {
    console.error('Orders API POST error:', error)
    return NextResponse.json({ error: 'Failed to persist order' }, { status: 500 })
  }
}
