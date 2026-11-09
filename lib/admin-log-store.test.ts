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
})
