import { NextRequest, NextResponse } from 'next/server'
import { createServerOrder, releaseExpiredStockReservations, InsufficientBonusPointsError, InsufficientStockError, PromoCodeUsageLimitError, type ServerOrder } from '@/lib/orders-data-store'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import { getServerUser } from '@/lib/server-auth'
import { recomputeOrderPricing } from '@/lib/server-pricing'
import { stores } from '@/data/stores'
import { translations } from '@/data/translations'
import { getLocaleConfig } from '@/lib/locale-config-server-store'
import { formatDateWithPattern } from '@/lib/date-format'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { isTurnstileRequired, TurnstileConfigurationError, verifyTurnstile } from '@/lib/turnstile-server'
import { getCorrelationId, logOperationalEvent } from '@/lib/observability'

export const runtime = 'nodejs'

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, escHtml(value)),
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
      ru: `<h2>Здравствуйте, ${escHtml(firstName)}!</h2><p>Ваш заказ <strong>№${order.id}</strong> оформлен. Сумма: <strong>${total}</strong>.</p><p>Мы свяжемся с вами для подтверждения.</p>`,
      en: `<h2>Hello, ${escHtml(firstName)}!</h2><p>Your order <strong>#${order.id}</strong> has been placed. Total: <strong>${total}</strong>.</p><p>We will contact you to confirm the details.</p>`,
      lv: `<h2>Labdien, ${escHtml(firstName)}!</h2><p>Jūsu pasūtījums <strong>№${order.id}</strong> pieņemts. Summa: <strong>${total}</strong>.</p><p>Sazināsimies ar jums, lai apstiprinātu detaļas.</p>`,
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

  // Admin notification is intentionally in Russian regardless of order.language.
  // Date/time use the admin-configured business timezone + date pattern, not the
  // Node process's own timezone (which varies by hosting region).
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = getCorrelationId(req)
  try {
    let captchaRequired: boolean
    try {
      captchaRequired = isTurnstileRequired()
    } catch (error) {
      if (error instanceof TurnstileConfigurationError) {
        return NextResponse.json({ error: 'captcha_not_configured' }, { status: 503 })
      }
      throw error
    }
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 65_536) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    }

    const { order, turnstileToken } = (await req.json()) as { order?: ServerOrder; turnstileToken?: string }

    if (!order) {
      return NextResponse.json({ error: 'order payload is required' }, { status: 400 })
    }

    const items = Array.isArray(order.items) ? order.items : []
    const email = typeof order.email === 'string' ? order.email.trim().toLowerCase() : ''

    // Untrusted client JSON — validate as a loose bag of strings rather than the
    // discriminated ServerOrderLegalDetails shape the rest of the codebase trusts.
    const rawLegalDetails = order.legalDetails as Partial<{
      customerType: string
      personalCode: string
      companyName: string
      regNumber: string
      vatNumber: string
      legalAddress: string
      bankName: string
      iban: string
    }> | undefined
    const isCompanyOrder = rawLegalDetails?.customerType === 'company'

    // Phone is only required for private customers — the real Hairshop.lv company
    // form doesn't mark it mandatory (companies are reached via the contact email).
    const requiredContactFields = isCompanyOrder
      ? [order.firstName, order.lastName, order.address, order.city]
      : [order.firstName, order.lastName, order.phone, order.address, order.city]
    if (requiredContactFields.some((value) => typeof value !== 'string' || !value.trim())) {
      return NextResponse.json({ error: 'missing_contact_fields' }, { status: 400 })
    }

    if (isCompanyOrder) {
      const companyName = rawLegalDetails?.companyName?.trim() ?? ''
      const regNumber = rawLegalDetails?.regNumber?.trim() ?? ''
      const vatNumber = rawLegalDetails?.vatNumber ?? ''
      const legalAddress = rawLegalDetails?.legalAddress?.trim() ?? ''
      const bankName = rawLegalDetails?.bankName?.trim() ?? ''
      const iban = rawLegalDetails?.iban?.trim() ?? ''
      if (!companyName || !regNumber || !legalAddress || !bankName || !iban) {
        return NextResponse.json({ error: 'missing_legal_details' }, { status: 400 })
      }
      if (
        companyName.length > 200 || regNumber.length > 50 || vatNumber.length > 50
        || legalAddress.length > 300 || bankName.length > 200 || iban.length > 50
      ) {
        return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
      }
    } else if (!rawLegalDetails || rawLegalDetails.customerType === 'individual') {
      const personalCode = rawLegalDetails?.personalCode?.trim() ?? ''
      if (!personalCode) {
        return NextResponse.json({ error: 'missing_legal_details' }, { status: 400 })
      }
      if (personalCode.length > 32) {
        return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: 'invalid_legal_details' }, { status: 400 })
    }

    const fieldTooLong =
      (order.firstName?.length ?? 0) > 100
      || (order.lastName?.length ?? 0) > 100
      || email.length > 254
      || (order.phone?.length ?? 0) > 32
      || (order.address?.length ?? 0) > 300
      || (order.city?.length ?? 0) > 100
      || (order.postalCode?.length ?? 0) > 20
      || (order.promoCode?.length ?? 0) > 64
    if (fieldTooLong) return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    if (items.length < 1 || items.length > 50 || items.some((item) =>
      typeof item.id !== 'string' || !item.id || item.id.length > 128
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000)) {
      return NextResponse.json({ error: 'invalid_items' }, { status: 400 })
    }
    if (!['courier', 'pickup', 'post'].includes(order.deliveryMethod)) {
      return NextResponse.json({ error: 'invalid_delivery_method' }, { status: 400 })
    }
    if (!['card', 'bank', 'cash'].includes(order.paymentMethod)) {
      return NextResponse.json({ error: 'invalid_payment_method' }, { status: 400 })
    }

    // Recompute all money fields from the authoritative DB catalog — never trust client prices/totals.
    // Bonus can only be spent by an authenticated user and is capped by their real DB balance.
    const caller = await getServerUser()
    const ip = req.headers.get('cf-connecting-ip')?.trim()
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')?.trim()
      || 'unknown'
    const ORDER_LIMIT = caller
      ? { windowMs: 60 * 60 * 1000, maxAttempts: 10 }
      : { windowMs: 60 * 60 * 1000, maxAttempts: 3 }
    const limits = await Promise.all([
      checkRateLimit(`order-create:ip:${ip}`, ORDER_LIMIT),
      checkRateLimit(`order-create:email:${email}`, ORDER_LIMIT),
      ...(caller ? [checkRateLimit(`order-create:session:${caller.id}`, ORDER_LIMIT)] : []),
    ])
    const limited = limits.find((item) => item.limited)
    if (limited) {
      return NextResponse.json({ error: 'rate_limited', resetAt: limited.resetAt }, {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))) },
      })
    }

    if (!caller) {
      if (captchaRequired) {
        if (!turnstileToken?.trim()) return NextResponse.json({ error: 'captcha_required' }, { status: 400 })
        if (!(await verifyTurnstile(turnstileToken, ip))) {
          return NextResponse.json({ error: 'captcha_failed' }, { status: 400 })
        }
      }
    }

    await releaseExpiredStockReservations()
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
      ? { address: `${translations.lv[`stores.${pickupStore.id}.name`]} — ${pickupStore.address.lv}`, city: pickupStore.city.lv }
      : {}

    const orderBase: Omit<ServerOrder, 'id'> = {
      ...orderFields,
      ...pickupAddressPatch,
      // Bind the order to the authenticated user/company at creation for reliable ownership checks.
      userId: caller?.id,
      companyId: caller?.companyId,
      email,
      createdAt: new Date().toISOString(),
      stockReservationStatus: (!caller || order.paymentMethod === 'card') ? 'reserved' : 'committed',
      stockReservedUntil: (!caller || order.paymentMethod === 'card')
        ? new Date(Date.now() + 35 * 60 * 1000).toISOString()
        : undefined,
    }

    const created = await createServerOrder(orderBase, async (tx, currentBonusBalance) => {
      const pricing = await recomputeOrderPricing({
        items: items.map((item) => ({ id: item.id, quantity: item.quantity, price: item.price })),
        promoCode: order.promoCode,
        deliveryMethod: order.deliveryMethod,
        bonusSpent: order.bonusSpent,
        userBonusBalance: currentBonusBalance,
      }, tx)
      return {
        ...orderBase,
        items: items.map((item, idx) => ({
          ...item,
          price: pricing.items[idx]?.price ?? item.price,
          quantity: pricing.items[idx]?.quantity ?? item.quantity,
        })),
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        tax: pricing.tax,
        delivery: pricing.delivery,
        bonusSpent: pricing.bonusSpent || undefined,
        bonusEarned: pricing.bonusEarned || undefined,
        total: pricing.total,
        promoCode: pricing.promoApplied ? order.promoCode : undefined,
      }
    })

    logOperationalEvent({
      event: 'order_created',
      correlationId,
      orderId: created.id,
      paymentProvider: created.paymentProvider,
      paymentStatus: created.paymentStatus,
      itemCount: created.items.length,
      total: created.total,
    })

    sendOrderConfirmationEmail(created).catch((error) => logOperationalEvent({
      event: 'order_customer_email_failed', level: 'error', alert: true, correlationId, orderId: created.id,
    }, error))
    sendAdminOrderNotificationEmail(
      created,
      pickupStore ? `${translations.lv[`stores.${pickupStore.id}.name`]} — ${pickupStore.address.lv}` : undefined
    ).catch((error) => logOperationalEvent({
      event: 'order_admin_email_failed', level: 'error', alert: true, correlationId, orderId: created.id,
    }, error))

    if (Math.random() < 0.01) void gcRateLimitStore()

    return NextResponse.json({ success: true, orderId: created.id })
  } catch (error) {
    logOperationalEvent({ event: 'order_create_failed', level: 'error', alert: true, correlationId }, error)
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: 'insufficient_stock', items: error.items },
        { status: 409 }
      )
    }
    if (error instanceof InsufficientBonusPointsError) {
      return NextResponse.json({ error: 'insufficient_bonus_points' }, { status: 409 })
    }
    if (error instanceof PromoCodeUsageLimitError) {
      return NextResponse.json({ error: 'promo_code_usage_limit' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to persist order' }, { status: 500 })
  }
}
