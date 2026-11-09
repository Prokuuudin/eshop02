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

  it.each([
    ['ru', 'Создание ценовой группы', 'Изменение ценовой группы', 'Удаление ценовой группы', 'Установка индивидуальной цены', 'Снятие индивидуальной цены'],
    ['lv', 'Cenu grupa izveidota', 'Cenu grupa atjaunināta', 'Cenu grupa dzēsta', 'Individuālā cena iestatīta', 'Individuālā cena noņemta'],
    ['en', 'Price group created', 'Price group updated', 'Price group deleted', 'Custom product price set', 'Custom product price removed'],
  ] as const)('names price-group events in %s', (language, created, updated, deleted, priceSet, priceRemoved) => {
    const labels = getAdminActionLabels(language)
    expect(labels['price_group.created']).toBe(created)
    expect(labels['price_group.updated']).toBe(updated)
    expect(labels['price_group.deleted']).toBe(deleted)
    expect(labels['price_group.product_price_set']).toBe(priceSet)
    expect(labels['price_group.product_price_removed']).toBe(priceRemoved)
  })

  it.each([
    ['ru', 'Восстановление конфигурации'],
    ['lv', 'Konfigurācija atjaunota'],
    ['en', 'Configuration restored'],
  ] as const)('names the configuration restore event in %s', (language, label) => {
    expect(getAdminActionLabels(language)['settings.configuration_restored']).toBe(label)
  })

  it.each([
    ['ru', 'Одобрение заявки на доступ', 'Отклонение заявки на доступ'],
    ['lv', 'Piekļuves pieteikums apstiprināts', 'Piekļuves pieteikums noraidīts'],
    ['en', 'Access request approved', 'Access request rejected'],
  ] as const)('names access request decisions in %s', (language, approved, rejected) => {
    const labels = getAdminActionLabels(language)
    expect(labels['access_request.approved']).toBe(approved)
    expect(labels['access_request.rejected']).toBe(rejected)
  })

  it.each([
    ['ru', 'Загрузка медиафайла', 'Замена медиафайла', 'Удаление медиафайла'],
    ['lv', 'Multivides fails augšupielādēts', 'Multivides fails aizstāts', 'Multivides fails dzēsts'],
    ['en', 'Media file uploaded', 'Media file replaced', 'Media file deleted'],
  ] as const)('names media events in %s', (language, uploaded, replaced, deleted) => {
    const labels = getAdminActionLabels(language)
    expect(labels['media.uploaded']).toBe(uploaded)
    expect(labels['media.replaced']).toBe(replaced)
    expect(labels['media.deleted']).toBe(deleted)
  })

  it.each([
    ['ru', ['Создание приглашения', 'Замена приглашения', 'Результат отправки приглашений', 'Запись SMS-приглашений', 'Назначение карты клиенту']],
    ['lv', ['Ielūgums izveidots', 'Ielūgums aizstāts', 'Ielūgumu nosūtīšanas rezultāts', 'SMS ielūgumi reģistrēti', 'Klientam piešķirta karte']],
    ['en', ['Invitation created', 'Invitation replaced', 'Invitation delivery result', 'SMS invitations recorded', 'Customer card assigned']],
  ] as const)('names invitation events in %s', (language, expected) => {
    const labels = getAdminActionLabels(language)
    const actions = ['invitation.created', 'invitation.replaced', 'invitation.delivery_recorded', 'invitation.sms_recorded', 'invitation.card_assigned'] as const
    expect(actions.map((action) => labels[action])).toEqual(expected)
  })
})
