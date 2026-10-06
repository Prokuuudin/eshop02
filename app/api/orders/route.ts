import { validateOrderDelivery, OrderDeliveryError } from '@/lib/validate-order-delivery'
import { getShippingSettings } from '@/lib/shipping-settings-server'
import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml as escHtml } from '@/lib/escape-html'
import { createServerOrder, releaseExpiredStockReservations, updateServerOrderPayment, InsufficientBonusPointsError, InsufficientStockError, PromoCodeUsageLimitError, type ServerOrder } from '@/lib/orders-data-store'
import { createPayseraPaymentForOrder } from '@/lib/paysera'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import { getServerUser } from '@/lib/server-auth'
import { ProductUnavailableError, recomputeOrderPricing } from '@/lib/server-pricing'
import { stores } from '@/data/stores'
import { translations } from '@/data/translations'
import { getLocaleConfig } from '@/lib/locale-config-server-store'
import { formatDateWithPattern } from '@/lib/date-format'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { isTurnstileRequired, TurnstileConfigurationError, verifyTurnstile } from '@/lib/turnstile-server'
import { getCorrelationId, logOperationalEvent } from '@/lib/observability'
import { createHash } from 'node:crypto'
import { ExistingCheckoutOrderError, type ServerOrderLegalDetails } from '@/lib/orders-data-store'
import { buildOrderItemSnapshot, ORDER_ITEM_SNAPSHOT_SELECT } from '@/lib/orders-data-mapping'
import { isSelectedVariantsInput, resolveSelectedVariants } from '@/lib/product-variants'
import { buildLineKey } from '@/lib/cart-store'
import type { SelectedVariant } from '@/data/products'

export const runtime = 'nodejs'

/**
 * The only checkout fields read from the request body. Everything else on the persisted
 * order (payment state, prices, totals, item snapshots, ownership) is decided server-side.
 */
type CheckoutOrderInput = {
  firstName?: unknown
  lastName?: unknown
  email?: unknown
  phone?: unknown
  address?: unknown
  city?: unknown
  postalCode?: unknown
  country?: unknown
  deliveryMethod?: unknown
  deliveryLocationId?: unknown
  pickupStoreId?: unknown
  paymentMethod?: unknown
  promoCode?: unknown
  bonusSpent?: unknown
  language?: unknown
  legalDetails?: unknown
  items?: unknown
}

type CheckoutLineInput = { id: string; quantity: number; selectedVariants?: SelectedVariant[] }

/** A requested variant does not exist on the product (forged or stale cart). */
class InvalidVariantSelectionError extends Error {
  constructor(readonly items: string[]) {
    super(`Invalid variant selection: ${items.join(', ')}`)
    this.name = 'InvalidVariantSelectionError'
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

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
  if (order.deliveryLocation) {
    const location = order.deliveryLocation
    const titles = { ru: 'Пакомат доставки', en: 'Delivery parcel locker', lv: 'Piegādes pakomāts' }
    const details = `<p><strong>${titles[lang]}:</strong> ${escHtml(location.name)}, ${escHtml(location.address)}, ${escHtml(location.city)}, ${escHtml(location.country)} (ID: ${escHtml(location.id)})</p>`
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${details}</body>`) : html + details
  }
  await sendEmail(order.email, subjects[lang], html)
}

const DELIVERY_LABELS_RU: Record<string, string> = {
  courier: 'Курьер',
  pickup: 'Самовывоз',
  post: 'Пакоматы Omniva',
  unisend: 'Unisend',
  unisend_courier: 'Unisend courier',
  venipak_courier: 'Venipak courier',
  expresspasts: 'Expresspasts',
  expresspasts_courier: 'Expresspasts courier',
  venipak: 'Пакоматы Venipak',
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
    ${order.deliveryLocation ? `<tr><td style="padding:4px 8px">Pakomāts</td><td style="padding:4px 8px">${escHtml(order.deliveryLocation.name)}, ${escHtml(order.deliveryLocation.address)}, ${escHtml(order.deliveryLocation.city)} (ID: ${escHtml(order.deliveryLocation.id)})</td></tr>` : ''}
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

    const { order, turnstileToken } = (await req.json()) as { order?: CheckoutOrderInput; turnstileToken?: string }

    if (!order || typeof order !== 'object') {
      return NextResponse.json({ error: 'order payload is required' }, { status: 400 })
    }

    const rawItems: unknown[] = Array.isArray(order.items) ? order.items : []
    const email = typeof order.email === 'string' ? order.email.trim().toLowerCase() : ''
    const deliveryMethod = text(order.deliveryMethod).trim()
    const paymentMethod = text(order.paymentMethod)
    const promoCode = text(order.promoCode).trim() || undefined
    const idempotencyKey = req.headers.get('idempotency-key')?.trim() ?? ''
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
      return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })
    }

    // Untrusted client JSON — validate as a loose bag of values and rebuild the
    // discriminated ServerOrderLegalDetails shape explicitly (never persisted as sent).
    const rawLegalDetails = order.legalDetails as Partial<Record<
      'customerType' | 'invoicePersonalCode' | 'companyName' | 'regNumber' | 'vatNumber' | 'legalAddress' | 'bankName' | 'iban',
      unknown
    >> | undefined
    const isCompanyOrder = rawLegalDetails?.customerType === 'company'

    // Phone is only required for private customers — the real Hairshop.lv company
    // form doesn't mark it mandatory (companies are reached via the contact email).
    const requiresHomeAddress = deliveryMethod === 'courier'
    const requiredContactFields = isCompanyOrder
      ? [order.firstName, order.lastName, ...(requiresHomeAddress ? [order.address, order.city, order.postalCode] : [])]
      : [order.firstName, order.lastName, order.phone, ...(requiresHomeAddress ? [order.address, order.city, order.postalCode] : [])]
    if (requiredContactFields.some((value) => typeof value !== 'string' || !value.trim())) {
      return NextResponse.json({ error: 'missing_contact_fields' }, { status: 400 })
    }

    let legalDetails: ServerOrderLegalDetails
    if (isCompanyOrder) {
      const companyName = text(rawLegalDetails?.companyName).trim()
      const regNumber = text(rawLegalDetails?.regNumber).trim()
      const vatNumber = text(rawLegalDetails?.vatNumber).trim()
      const legalAddress = text(rawLegalDetails?.legalAddress).trim()
      const bankName = text(rawLegalDetails?.bankName).trim()
      const iban = text(rawLegalDetails?.iban).trim()
      if (!companyName || !regNumber || !legalAddress) {
        return NextResponse.json({ error: 'missing_legal_details' }, { status: 400 })
      }
      if (
        companyName.length > 200 || regNumber.length > 50 || vatNumber.length > 50
        || legalAddress.length > 300 || bankName.length > 200 || iban.length > 50
      ) {
        return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
      }
      legalDetails = {
        customerType: 'company',
        companyName,
        regNumber,
        ...(vatNumber ? { vatNumber } : {}),
        legalAddress,
        bankName,
        iban,
      }
    } else if (!rawLegalDetails || rawLegalDetails.customerType === 'individual') {
      const invoicePersonalCode = rawLegalDetails?.invoicePersonalCode
      if (invoicePersonalCode !== undefined && (typeof invoicePersonalCode !== 'string' || invoicePersonalCode.trim().length > 64)) {
        return NextResponse.json({ error: 'invalid_invoice_personal_code' }, { status: 400 })
      }
      legalDetails = {
        customerType: 'individual',
        ...(typeof invoicePersonalCode === 'string' && invoicePersonalCode.trim() ? { invoicePersonalCode: invoicePersonalCode.trim() } : {}),
      }
    } else {
      return NextResponse.json({ error: 'invalid_legal_details' }, { status: 400 })
    }

    const fieldTooLong =
      text(order.firstName).length > 100
      || text(order.lastName).length > 100
      || email.length > 254
      || text(order.phone).length > 32
      || text(order.address).length > 300
      || text(order.city).length > 100
      || text(order.postalCode).length > 20
      || (promoCode?.length ?? 0) > 64
    if (fieldTooLong) return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    if (rawItems.length < 1 || rawItems.length > 50 || rawItems.some((raw) => {
      const item = raw as Record<string, unknown> | null
      return !item || typeof item !== 'object'
        || typeof item.id !== 'string' || !item.id || item.id.length > 128
        || typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000
        || !isSelectedVariantsInput(item.selectedVariants)
    })) {
      return NextResponse.json({ error: 'invalid_items' }, { status: 400 })
    }
    // Only the product id, quantity and variant choice are read from a line. Title, SKU,
    // brand, image, price and variant price adjustments come from the DB inside the transaction.
    const lines: CheckoutLineInput[] = rawItems.map((raw) => {
      const item = raw as { id: string; quantity: number; selectedVariants?: SelectedVariant[] | null }
      return {
        id: item.id,
        quantity: item.quantity,
        ...(item.selectedVariants?.length ? { selectedVariants: item.selectedVariants } : {}),
      }
    })
    const destination = validateOrderDelivery(order, await getShippingSettings())
    const { country } = destination
    const pickupStore = destination.pickupStoreId ? stores.find(store => store.id === destination.pickupStoreId) : undefined
    // PayPal remains integrated for possible future re-enablement, but customer-initiated
    // payments are temporarily disabled at the public API boundary as well as in the UI.
    if (paymentMethod === 'paypal') {
      return NextResponse.json({ error: 'payment_method_unavailable' }, { status: 400 })
    }
    // Card-at-terminal is office-only (in-person) — never offered as an online checkout method.
    // Paysera (Checkout Modern, sandbox as of 2026-09-07) is the active online gateway.
    if (!['bank', 'cash', 'paysera'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'invalid_payment_method' }, { status: 400 })
    }
    if (paymentMethod === 'cash' && (deliveryMethod !== 'pickup' || pickupStore?.id !== 'riga-office')) {
      return NextResponse.json({ error: 'cash_payment_unavailable' }, { status: 400 })
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

    // Online payment pending confirmation ('card' is legacy/unused; Paysera is live)
    // holds stock for 35 min instead of committing it immediately, same as a guest.
    const reserveStock = !caller || ['card', 'paysera'].includes(paymentMethod)

    // Explicit whitelist. The order id (server-generated: client counters collide and would
    // overwrite foreign orders), payment state, ownership, timestamps and all money fields
    // are never read from the request body.
    const orderBase: Omit<ServerOrder, 'id'> = {
      createdAt: new Date().toISOString(),
      // Line snapshots and totals are filled in by the transactional prepare step below.
      items: [],
      subtotal: 0,
      tax: 0,
      delivery: 0,
      discount: 0,
      total: 0,
      legalDetails,
      firstName: text(order.firstName),
      lastName: text(order.lastName),
      email,
      phone: text(order.phone),
      ...destination,
      paymentMethod,
      // A new order is unpaid until staff or a verified gateway callback confirms payment;
      // the provider follows from the validated payment method, never from the client.
      paymentStatus: 'unpaid',
      paymentProvider: paymentMethod === 'paysera' ? 'paysera' : 'manual',
      language: ['ru', 'en', 'lv'].includes(order.language as string) ? order.language as string : 'ru',
      // Bind the order to the authenticated user/company at creation for reliable ownership checks.
      userId: caller?.id,
      companyId: caller?.companyId,
      checkoutKey: idempotencyKey
        ? createHash('sha256').update(`${caller?.id ?? email}:${idempotencyKey}`).digest('hex')
        : undefined,
      stockReservationStatus: reserveStock ? 'reserved' : 'committed',
      stockReservedUntil: reserveStock ? new Date(Date.now() + 35 * 60 * 1000).toISOString() : undefined,
    }

    let created = await createServerOrder(orderBase, async (tx, currentBonusBalance) => {
      const pricing = await recomputeOrderPricing({
        items: lines.map(({ id, quantity }) => ({ id, quantity })),
        promoCode,
        country,
        deliveryMethod,
        bonusSpent: typeof order.bonusSpent === 'number' ? order.bonusSpent : null,
        userBonusBalance: currentBonusBalance,
        userId: caller?.id,
        email,
      }, tx)
      // Same transaction as pricing and the stock guard: the snapshot describes exactly the
      // products that were priced (pricing already rejected anything not purchasable).
      const products = await tx.product.findMany({
        where: { id: { in: [...new Set(lines.map((line) => line.id))] } },
        select: ORDER_ITEM_SNAPSHOT_SELECT,
      })
      const productById = new Map(products.map((product) => [product.id, product]))
      const missing: string[] = []
      const invalidVariants: string[] = []
      const snapshotItems = lines.flatMap((line, idx) => {
        const product = productById.get(line.id)
        const priced = pricing.items[idx]
        if (!product || !priced || priced.id !== line.id) {
          missing.push(line.id)
          return []
        }
        const selectedVariants = resolveSelectedVariants(product.technicalSpecs, line.selectedVariants)
        if (!selectedVariants) {
          invalidVariants.push(line.id)
          return []
        }
        return [buildOrderItemSnapshot(product, {
          quantity: priced.quantity,
          price: priced.price,
          lineKey: buildLineKey(product.id, selectedVariants),
          variantLabel: selectedVariants.map((variant) => `${variant.groupName}: ${variant.value}`).join(', ') || undefined,
          selectedVariants,
        })]
      })
      if (missing.length > 0) throw new ProductUnavailableError([...new Set(missing)])
      if (invalidVariants.length > 0) throw new InvalidVariantSelectionError([...new Set(invalidVariants)])
      return {
        ...orderBase,
        items: snapshotItems,
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        tax: pricing.tax,
        delivery: pricing.delivery,
        bonusSpent: pricing.bonusSpent || undefined,
        bonusEarned: pricing.bonusEarned || undefined,
        total: pricing.total,
        promoCode: pricing.promoApplied ? promoCode : undefined,
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

    // Online payment: create the gateway order + payment link before telling the customer
    // "success" — if the gateway call fails, fail the local order (releases the stock hold)
    // rather than showing a confirmation screen with no way to actually pay.
    let paymentUrl: string | undefined
    if (paymentMethod === 'paysera') {
      try {
        const payment = await createPayseraPaymentForOrder(created)
        created = payment.order ?? created
        paymentUrl = payment.paymentUrl
      } catch (error) {
        logOperationalEvent({
          event: `${paymentMethod}_create_payment_failed`, level: 'error', alert: true, correlationId, orderId: created.id,
        }, error)
        await updateServerOrderPayment(created.id, { paymentStatus: 'failed' }).catch(() => {})
        return NextResponse.json({ error: 'payment_gateway_error' }, { status: 502 })
      }
    }

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

    return NextResponse.json({ success: true, orderId: created.id, order: created, deliveryLocation: created.deliveryLocation, ...(paymentUrl ? { paymentUrl } : {}) })
  } catch (error) {
    if (error instanceof OrderDeliveryError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof ExistingCheckoutOrderError) {
      const existing = error.order
      if (existing.stockReservationStatus === 'released' || (existing.stockReservationStatus === 'reserved'
        && (!existing.stockReservedUntil || new Date(existing.stockReservedUntil) <= new Date()))) {
        return NextResponse.json({ error: 'stock_reservation_expired' }, { status: 409 })
      }
      // A resubmit (double-click / network retry before the client got the first response)
      // hits the same checkoutKey. The original payment link is gone with that response —
      // mint a fresh one rather than sending the customer back to a dead-end confirmation page.
      if (existing.paymentMethod === 'paysera' && existing.paymentStatus !== 'paid') {
        try {
          const payment = await createPayseraPaymentForOrder(existing)
          return NextResponse.json({ success: true, orderId: existing.id, order: payment.order ?? existing, deliveryLocation: existing.deliveryLocation, idempotent: true, paymentUrl: payment.paymentUrl })
        } catch (gatewayError) {
          logOperationalEvent({
            event: `${existing.paymentMethod}_create_payment_failed`, level: 'error', alert: true, correlationId, orderId: existing.id,
          }, gatewayError)
          // Fall through: the order still exists and is safe to report as-is; the customer
          // can retry payment from the order page instead of getting a hard failure here.
        }
      }
      return NextResponse.json({ success: true, orderId: existing.id, order: existing, deliveryLocation: existing.deliveryLocation, idempotent: true })
    }
    if (error instanceof ProductUnavailableError) {
      return NextResponse.json({ error: 'product_unavailable', items: error.items }, { status: 409 })
    }
    if (error instanceof InvalidVariantSelectionError) {
      return NextResponse.json({ error: 'invalid_variant', items: error.items }, { status: 400 })
    }
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
