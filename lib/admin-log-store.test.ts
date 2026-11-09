import { describe, expect, it } from 'vitest'
import { getAdminActionLabels } from './admin-log-store'

describe('administrator audit event labels', () => {
  it.each([
    ['ru', 'Ручное изменение статуса оплаты', 'Обновление контента сайта'],
    ['lv', 'Maksājuma statuss mainīts manuāli', 'Vietnes saturs atjaunināts'],
    ['en', 'Payment status updated manually', 'Site content updated'],
  ] as const)('names the new events in %s', (language, payment, content) => {
    const labels = getAdminActionLabels(language)
    expect(labels['order.payment_status_updated']).toBe(payment)
    expect(labels['site_content.updated']).toBe(content)
  })

  it.each([
    ['ru', 'Восстановление товара', 'Окончательное удаление товара'],
    ['lv', 'Produkts atjaunots', 'Produkts neatgriezeniski dzēsts'],
    ['en', 'Product restored', 'Product permanently deleted'],
  ] as const)('names product archive events in %s', (language, restored, permanentlyDeleted) => {
    const labels = getAdminActionLabels(language)
    expect(labels['product.restored']).toBe(restored)
    expect(labels['product.permanently_deleted']).toBe(permanentlyDeleted)
  })

  it.each([
    ['ru', 'Перенос товара в архив', 'Сброс переопределения товара'],
    ['lv', 'Produkts pārvietots uz arhīvu', 'Produkta pārrakstījums atiestatīts'],
    ['en', 'Product moved to archive', 'Product override reset'],
  ] as const)('names product archive-move events in %s', (language, archived, overrideReset) => {
    const labels = getAdminActionLabels(language)
    expect(labels['product.archived']).toBe(archived)
    expect(labels['product.override_reset']).toBe(overrideReset)
  })
})
