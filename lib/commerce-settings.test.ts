import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMMERCE_SETTINGS,
  commerceSettingsSchema,
  getCommerceSettingsIssues,
  normalizeCommerceSettings,
} from './commerce-settings'

describe('commerce settings', () => {
  it('adds new carriers to old v2 settings without losing saved delivery rules', () => {
    const saved = structuredClone(DEFAULT_COMMERCE_SETTINGS)
    saved.delivery.omniva.enabled = false
    saved.delivery.omniva.freeFrom = 350
    const oldDelivery = saved.delivery as Partial<typeof saved.delivery>
    for (const id of ['unisend', 'unisend_courier', 'expresspasts', 'expresspasts_courier', 'venipak_courier'] as const) delete oldDelivery[id]
    const upgraded = normalizeCommerceSettings(saved)
    expect(upgraded.delivery.omniva.enabled).toBe(false)
    expect(upgraded.delivery.omniva.freeFrom).toBe(350)
    expect(upgraded.delivery.unisend.enabled).toBe(true)
    expect(upgraded.delivery.expresspasts.enabled).toBe(false)
    expect(commerceSettingsSchema.safeParse(upgraded).success).toBe(true)
  })
  it('ships with only the approved production delivery methods enabled', () => {
    expect(commerceSettingsSchema.safeParse(DEFAULT_COMMERCE_SETTINGS).success).toBe(true)
    expect(DEFAULT_COMMERCE_SETTINGS.payment.card_online.enabled).toBe(false)
    expect(DEFAULT_COMMERCE_SETTINGS.delivery.dpd.enabled).toBe(false)
    expect(DEFAULT_COMMERCE_SETTINGS.delivery.courier_riga.enabled).toBe(false)
    expect(DEFAULT_COMMERCE_SETTINGS.delivery.expresspasts.enabled).toBe(false)
    expect(DEFAULT_COMMERCE_SETTINGS.delivery.venipak_courier.enabled).toBe(false)
    expect(DEFAULT_COMMERCE_SETTINGS.delivery.unisend_courier.enabled).toBe(false)
    expect(DEFAULT_COMMERCE_SETTINGS.delivery.omniva.enabled).toBe(true)
    expect(DEFAULT_COMMERCE_SETTINGS.delivery.venipak.enabled).toBe(true)
    expect(DEFAULT_COMMERCE_SETTINGS.delivery.unisend.enabled).toBe(true)
  })

  it('migrates the legacy courier, pickup and post values without enabling new integrations', () => {
    const migrated = normalizeCommerceSettings({
      delivery: {
        courier: { enabled: true, price: 8, freeFrom: 120, label: 'Курьер' },
        pickup: { enabled: true, price: 0, freeFrom: 0, label: 'Самовывоз' },
        post: { enabled: true, price: 5, freeFrom: 200, label: 'Omniva' },
      },
    })

    expect(migrated.delivery.courier_riga.price).toBe(8)
    expect(migrated.delivery.omniva.freeFrom).toBe(200)
    expect(migrated.delivery.dpd.enabled).toBe(false)
    expect(migrated.payment.card_online.enabled).toBe(false)
  })

  it('reports enabled methods that have no price or compatible delivery', () => {
    const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
    settings.delivery.dpd.enabled = true
    settings.payment.card_online.enabled = true

    const issues = getCommerceSettingsIssues(settings)
    expect(issues).toContain('Доставка «DPD»: не указана цена')
    expect(issues).toContain('Оплата «Банковская карта онлайн»: не выбраны способы доставки')
    expect(issues).toContain('Paysera: merchant-аккаунт не готов')
  })
})
