import 'server-only'

import { pointsToEuros } from '@/lib/bonus-program'
import { formatDateWithPattern } from '@/lib/date-format'
import { escapeHtml as escHtml } from '@/lib/escape-html'
import { getLocaleConfig } from '@/lib/locale-config-server-store'
import { sendEmail } from '@/lib/mailer'
import { logOperationalEvent } from '@/lib/observability'
import type { ServerOrder } from '@/lib/orders-data-store'
import { stores } from '@/data/stores'
import { translations } from '@/data/translations'
import type { AdminOrderNotificationSource } from '@/lib/order-admin-notification-outbox'

export type { AdminOrderNotificationSource } from '@/lib/order-admin-notification-outbox'

export type AdminOrderNotificationContext = {
  source: AdminOrderNotificationSource
  correlationId?: string
  outboxId?: string
  attempt?: number
}

export type AdminOrderNotificationResult = 'sent' | 'not_configured' | 'failed'

const DELIVERY_LABELS_RU: Record<string, string> = {
  courier: 'Курьер',
  courier_riga: 'Курьер по Риге',
  courier_latvia: 'Курьер по Латвии',
  pickup: 'Самовывоз',
  post: 'Пакоматы Omniva',
  unisend: 'Пакоматы Unisend',
  unisend_courier: 'Курьер Unisend',
  venipak: 'Пакоматы Venipak',
  venipak_courier: 'Курьер Venipak',
  expresspasts: 'Пакоматы Express Pasts',
  expresspasts_courier: 'Курьер Express Pasts',
}

const PAYMENT_LABELS_RU: Record<string, string> = {
  bank: 'Банковский перевод',
  transfer: 'Банковский перевод',
  bank_transfer: 'Банковский перевод',
  cash: 'Наличными при самовывозе',
  cash_office: 'Наличные в офисе',
  card: 'Банковская карта',
  card_online: 'Банковская карта онлайн',
  card_office: 'Карта в офисе',
  internet_bank: 'Интернет-банк',
  invoice: 'Оплата по счёту',
  paysera: 'Онлайн-оплата Paysera',
  paypal: 'PayPal',
}

const PAYMENT_STATUS_LABELS_RU: Record<string, string> = {
  unpaid: 'Не оплачен',
  pending: 'Ожидает подтверждения',
  paid: 'Оплачен',
  failed: 'Ошибка оплаты',
}

const COUNTRY_LABELS_RU: Record<string, string> = {
  LV: 'Латвия',
  LT: 'Литва',
  EE: 'Эстония',
}

const money = (value: number | null | undefined): string =>
  `€${(Number.isFinite(value) ? Number(value) : 0).toFixed(2)}`

const labelFor = (labels: Record<string, string>, value: string | null | undefined): string => {
  const normalized = value?.trim() ?? ''
  return labels[normalized] ?? (normalized || '—')
}

function pickupStoreLabel(order: ServerOrder): string | undefined {
  if (!order.pickupStoreId) return undefined
  const store = stores.find((candidate) => candidate.id === order.pickupStoreId)
  if (!store) return order.pickupStoreId
  const name = translations.lv[`stores.${store.id}.name`] ?? store.id
  return `${name} — ${store.address.lv}`
}

export async function buildAdminOrderNotificationEmail(order: ServerOrder): Promise<{ subject: string; html: string }> {
  // Admin notification is intentionally in Russian regardless of order.language.
  const localeConfig = await getLocaleConfig()
  const orderDate = new Date(order.createdAt)
  const dateStr = formatDateWithPattern(orderDate, localeConfig.dateFormat, localeConfig.timezone)
  const timeStr = orderDate.toLocaleTimeString('en-GB', {
    timeZone: localeConfig.timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
  const date = `${dateStr} ${timeStr}`
  const items = Array.isArray(order.items) ? order.items : []

  const itemRows = items.map((item) => `<tr>
    <td style="padding:4px 8px">${escHtml(item.title ?? '—')}</td>
    <td style="padding:4px 8px;text-align:center">${item.quantity ?? 1}</td>
    <td style="padding:4px 8px;text-align:right">${money(item.price)}</td>
    <td style="padding:4px 8px;text-align:right">${money((item.price ?? 0) * (item.quantity ?? 1))}</td>
  </tr>`).join('')

  const promoCode = order.promoCode?.trim()
  const discountRow = order.discount > 0
    ? `<tr><td colspan="3" style="padding:4px 8px;text-align:right;color:#6b7280">${promoCode ? `Скидка по промокоду ${escHtml(promoCode)}` : 'Скидка'}</td><td style="padding:4px 8px;text-align:right">−${money(order.discount)}</td></tr>`
    : ''
  const bonusSpent = Math.max(0, Math.round(order.bonusSpent ?? 0))
  const bonusRow = bonusSpent > 0
    ? `<tr><td colspan="3" style="padding:4px 8px;text-align:right;color:#6b7280">Списано бонусов: ${bonusSpent}</td><td style="padding:4px 8px;text-align:right">−${money(pointsToEuros(bonusSpent))}</td></tr>`
    : ''
  const storeLabel = pickupStoreLabel(order)

  const html = `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px">
  <h2 style="margin-top:0">Новый заказ №${escHtml(order.id)}</h2>
  <p style="color:#6b7280;margin-top:-8px">${date}</p>

  <h3>Покупатель</h3>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:4px 8px;color:#6b7280;width:150px">Имя</td><td style="padding:4px 8px">${escHtml(order.firstName ?? '')} ${escHtml(order.lastName ?? '')}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Email</td><td style="padding:4px 8px">${escHtml(order.email ?? '')}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Телефон</td><td style="padding:4px 8px">${escHtml(order.phone ?? '—')}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Страна</td><td style="padding:4px 8px">${escHtml(labelFor(COUNTRY_LABELS_RU, order.country))}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Адрес</td><td style="padding:4px 8px">${escHtml(order.address ?? '')}, ${escHtml(order.city ?? '')}${order.postalCode ? `, ${escHtml(order.postalCode)}` : ''}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Доставка</td><td style="padding:4px 8px">${escHtml(labelFor(DELIVERY_LABELS_RU, order.deliveryMethod))}</td></tr>
    ${order.deliveryLocation ? `<tr><td style="padding:4px 8px;color:#6b7280">Пакомат</td><td style="padding:4px 8px">${escHtml(order.deliveryLocation.name)}, ${escHtml(order.deliveryLocation.address)}, ${escHtml(order.deliveryLocation.city)} (ID: ${escHtml(order.deliveryLocation.id)})</td></tr>` : ''}
    ${storeLabel ? `<tr><td style="padding:4px 8px;color:#6b7280">Магазин</td><td style="padding:4px 8px">${escHtml(storeLabel)}</td></tr>` : ''}
    <tr><td style="padding:4px 8px;color:#6b7280">Способ оплаты</td><td style="padding:4px 8px">${escHtml(labelFor(PAYMENT_LABELS_RU, order.paymentMethod))}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Статус оплаты</td><td style="padding:4px 8px">${escHtml(labelFor(PAYMENT_STATUS_LABELS_RU, order.paymentStatus))}</td></tr>
    <tr><td style="padding:4px 8px;color:#6b7280">Промокод</td><td style="padding:4px 8px">${escHtml(promoCode || '—')}</td></tr>
  </table>

  <h3>Товары</h3>
  <table style="border-collapse:collapse;width:100%">
    <thead><tr style="background:#f3f4f6">
      <th style="padding:4px 8px;text-align:left;font-weight:600">Товар</th>
      <th style="padding:4px 8px;text-align:center;font-weight:600">Кол.</th>
      <th style="padding:4px 8px;text-align:right;font-weight:600">Цена</th>
      <th style="padding:4px 8px;text-align:right;font-weight:600">Итого</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr><td colspan="3" style="padding:4px 8px;text-align:right;color:#6b7280">Сумма товаров</td><td style="padding:4px 8px;text-align:right">${money(order.subtotal)}</td></tr>
      ${discountRow}
      <tr><td colspan="3" style="padding:4px 8px;text-align:right;color:#6b7280">Доставка</td><td style="padding:4px 8px;text-align:right">${money(order.delivery)}</td></tr>
      ${bonusRow}
      <tr style="font-weight:bold;border-top:2px solid #e5e7eb">
        <td colspan="3" style="padding:8px 8px 4px;text-align:right">ИТОГО</td>
        <td style="padding:8px 8px 4px;text-align:right">${money(order.total)}</td>
      </tr>
    </tfoot>
  </table>
</div>`

  return {
    subject: `Новый заказ №${order.id} — ${order.firstName ?? ''} ${order.lastName ?? ''} — ${money(order.total)}`,
    html,
  }
}

function safeErrorDetails(error: unknown): { errorType: string; responseCode?: number } {
  const responseCode = typeof (error as { responseCode?: unknown } | null)?.responseCode === 'number'
    ? (error as { responseCode: number }).responseCode
    : undefined
  return {
    errorType: error instanceof Error ? error.name : 'UnknownError',
    ...(responseCode === undefined ? {} : { responseCode }),
  }
}

/**
 * Best-effort stage-1 notification. It deliberately never rejects: the order has already
 * been committed and an SMTP/configuration problem must not roll it back or change payment state.
 */
export async function sendAdminOrderNotificationEmail(
  order: ServerOrder,
  context: AdminOrderNotificationContext,
): Promise<AdminOrderNotificationResult> {
  const adminEmail = process.env.CONTACT_TO?.trim()
  const diagnostics = {
    correlationId: context.correlationId,
    orderId: order.id,
    outboxId: context.outboxId,
    attempt: context.attempt,
    source: context.source,
    paymentStatus: order.paymentStatus ?? 'unknown',
    paymentProvider: order.paymentProvider ?? 'unknown',
  }

  if (!adminEmail) {
    logOperationalEvent({
      event: 'order_admin_email_failed',
      level: 'warn',
      alert: true,
      ...diagnostics,
      reason: 'contact_to_missing',
      recipientConfigured: false,
    })
    return 'not_configured'
  }

  try {
    const message = await buildAdminOrderNotificationEmail(order)
    await sendEmail(adminEmail, message.subject, message.html, { correlationId: context.correlationId })
    logOperationalEvent({
      event: 'order_admin_email_succeeded',
      ...diagnostics,
      recipientConfigured: true,
    })
    return 'sent'
  } catch (error) {
    logOperationalEvent({
      event: 'order_admin_email_failed',
      level: 'error',
      alert: true,
      ...diagnostics,
      reason: 'send_failed',
      recipientConfigured: true,
      ...safeErrorDetails(error),
    })
    return 'failed'
  }
}
