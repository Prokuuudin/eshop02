import { z } from 'zod'

export const COMMERCE_SETTINGS_KEY = 'shipping-settings'

export const deliveryMethodIds = [
  'pickup',
  'courier_riga',
  'courier_latvia',
  'omniva',
  'dpd',
  'venipak',
] as const

export const paymentMethodIds = [
  'card_online',
  'internet_bank',
  'paypal',
  'bank_transfer',
  'cash_office',
  'card_office',
  'invoice',
] as const

const deliveryMethodSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1).max(100),
  status: z.enum(['draft', 'ready']),
  countries: z.array(z.enum(['LV', 'LT', 'EE'])).min(1),
  price: z.number().finite().min(0).max(10_000).nullable(),
  freeFrom: z.number().finite().min(0).max(1_000_000).nullable(),
  maxWeightKg: z.number().finite().positive().max(10_000).nullable(),
  maxDimensionsCm: z.string().trim().max(100),
  eta: z.string().trim().max(100),
  requiresLocation: z.boolean(),
  notes: z.string().trim().max(500),
})

const paymentMethodSchema = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(1).max(100),
  status: z.enum(['draft', 'ready']),
  provider: z.enum(['paysera', 'paypal', 'manual']),
  audience: z.enum(['all', 'business']),
  allowedDeliveryMethods: z.array(z.enum(deliveryMethodIds)),
  notes: z.string().trim().max(500),
})

const providerSchema = z.object({
  accountStatus: z.enum(['not_started', 'in_progress', 'ready']),
  merchantId: z.string().trim().max(150),
  testModeAvailable: z.enum(['unknown', 'yes', 'no']),
  documentationUrl: z.union([z.literal(''), z.string().trim().url().max(500)]),
  contact: z.string().trim().max(200),
})

export const commerceSettingsSchema = z.object({
  version: z.literal(2),
  general: z.object({
    currency: z.literal('EUR'),
    pricesIncludeVat: z.boolean(),
    orderProcessingTime: z.string().trim().max(100),
    operationsContact: z.string().trim().max(200),
  }),
  delivery: z.record(z.enum(deliveryMethodIds), deliveryMethodSchema),
  payment: z.record(z.enum(paymentMethodIds), paymentMethodSchema),
  providers: z.object({ paysera: providerSchema, paypal: providerSchema }),
}).strict()

export type CommerceSettings = z.infer<typeof commerceSettingsSchema>
export type DeliveryMethodId = (typeof deliveryMethodIds)[number]
export type PaymentMethodId = (typeof paymentMethodIds)[number]

const delivery = (
  label: string,
  countries: Array<'LV' | 'LT' | 'EE'>,
  price: number | null,
  freeFrom: number | null,
  extra: Partial<CommerceSettings['delivery'][DeliveryMethodId]> = {}
): CommerceSettings['delivery'][DeliveryMethodId] => ({
  enabled: false,
  label,
  status: 'draft',
  countries,
  price,
  freeFrom,
  maxWeightKg: null,
  maxDimensionsCm: '',
  eta: 'от 3 рабочих дней',
  requiresLocation: false,
  notes: '',
  ...extra,
})

export const DEFAULT_COMMERCE_SETTINGS: CommerceSettings = {
  version: 2,
  general: {
    currency: 'EUR',
    pricesIncludeVat: true,
    orderProcessingTime: 'от 3 рабочих дней',
    operationsContact: 'office@miksplus.eu',
  },
  delivery: {
    pickup: delivery('Самовывоз', ['LV'], 0, 0, { enabled: true, status: 'ready' }),
    courier_riga: delivery('Курьер по Риге', ['LV'], 10, 100, { enabled: true }),
    courier_latvia: delivery('Курьер по Латвии', ['LV'], 10, 200, { enabled: true }),
    omniva: delivery('Пакоматы Omniva', ['LV', 'LT', 'EE'], 4, 200, {
      enabled: true,
      maxWeightKg: 30,
      maxDimensionsCm: '38 × 64 × 19',
      requiresLocation: true,
      notes: 'Цена указана «от 4 €» и требует точной тарифной таблицы.',
    }),
    dpd: delivery('DPD', ['LV', 'LT', 'EE'], null, null, { requiresLocation: true }),
    venipak: delivery('Venipak', ['LV', 'LT', 'EE'], null, null, { requiresLocation: true }),
  },
  payment: {
    card_online: { enabled: false, label: 'Банковская карта онлайн', status: 'draft', provider: 'paysera', audience: 'all', allowedDeliveryMethods: [], notes: 'Ожидается новый merchant-аккаунт Hairshop-Pro.' },
    internet_bank: { enabled: false, label: 'Интернет-банк', status: 'draft', provider: 'paysera', audience: 'all', allowedDeliveryMethods: [], notes: 'Нужно подтвердить список банков и стран.' },
    paypal: { enabled: false, label: 'PayPal', status: 'draft', provider: 'paypal', audience: 'all', allowedDeliveryMethods: [], notes: 'Ожидается новый аккаунт Hairshop-Pro.' },
    bank_transfer: { enabled: true, label: 'Банковский перевод', status: 'ready', provider: 'manual', audience: 'all', allowedDeliveryMethods: [...deliveryMethodIds], notes: '' },
    cash_office: { enabled: true, label: 'Наличные в офисе', status: 'ready', provider: 'manual', audience: 'all', allowedDeliveryMethods: ['pickup'], notes: 'Только офис Rencēnu iela 10A.' },
    card_office: { enabled: true, label: 'Карта в офисе', status: 'ready', provider: 'manual', audience: 'all', allowedDeliveryMethods: ['pickup'], notes: 'Только при получении в офисе.' },
    invoice: { enabled: true, label: 'Оплата по счёту', status: 'draft', provider: 'manual', audience: 'business', allowedDeliveryMethods: [...deliveryMethodIds], notes: 'Нужно определить предоплату/отсрочку и условия допуска.' },
  },
  providers: {
    paysera: { accountStatus: 'not_started', merchantId: '', testModeAvailable: 'unknown', documentationUrl: '', contact: 'office@miksplus.eu' },
    paypal: { accountStatus: 'not_started', merchantId: '', testModeAvailable: 'unknown', documentationUrl: '', contact: 'office@miksplus.eu' },
  },
}

/** Converts the old three-method admin payload to the new editable draft. */
export function normalizeCommerceSettings(value: unknown): CommerceSettings {
  const parsed = commerceSettingsSchema.safeParse(value)
  if (parsed.success) return parsed.data
  if (!value || typeof value !== 'object') return DEFAULT_COMMERCE_SETTINGS

  const legacy = value as { delivery?: Record<string, { enabled?: boolean; price?: number; freeFrom?: number; label?: string }> }
  const next = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  const mappings = { pickup: 'pickup', courier: 'courier_riga', post: 'omniva' } as const
  for (const [oldId, newId] of Object.entries(mappings)) {
    const old = legacy.delivery?.[oldId]
    if (!old) continue
    next.delivery[newId] = {
      ...next.delivery[newId],
      enabled: old.enabled ?? next.delivery[newId].enabled,
      price: Number.isFinite(old.price) ? Number(old.price) : next.delivery[newId].price,
      freeFrom: Number.isFinite(old.freeFrom) ? Number(old.freeFrom) : next.delivery[newId].freeFrom,
      label: old.label?.trim() || next.delivery[newId].label,
    }
  }
  return next
}

export function getCommerceSettingsIssues(settings: CommerceSettings): string[] {
  const issues: string[] = []
  for (const [id, method] of Object.entries(settings.delivery)) {
    if (method.enabled && method.status !== 'ready') issues.push(`Доставка «${method.label}»: не подтверждена готовность`)
    if (method.enabled && method.price === null) issues.push(`Доставка «${method.label}»: не указана цена`)
    if (method.enabled && method.requiresLocation && !method.maxWeightKg) issues.push(`Доставка «${method.label}»: не указан лимит веса`)
    if ((id === 'dpd' || id === 'venipak') && method.enabled && !method.notes) issues.push(`Доставка «${method.label}»: нет условий интеграции`)
  }
  for (const method of Object.values(settings.payment)) {
    if (method.enabled && method.status !== 'ready') issues.push(`Оплата «${method.label}»: не подтверждена готовность`)
    if (method.enabled && method.allowedDeliveryMethods.length === 0) issues.push(`Оплата «${method.label}»: не выбраны способы доставки`)
  }
  for (const [name, provider] of Object.entries(settings.providers)) {
    if (Object.values(settings.payment).some((method) => method.enabled && method.provider === name) && provider.accountStatus !== 'ready') {
      issues.push(`${name === 'paysera' ? 'Paysera' : 'PayPal'}: merchant-аккаунт не готов`)
    }
  }
  return issues
}
