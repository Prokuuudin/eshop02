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

  it.each([
    ['ru', ['Подготовка письма об отклонении заявки', 'Результат письма об отклонении заявки', 'Сброс рассылки правил карты', 'Запуск пакета рассылки правил карты', 'Результат пакета рассылки правил карты']],
    ['lv', ['Sagatavota pieteikuma noraidījuma vēstule', 'Pieteikuma noraidījuma vēstules rezultāts', 'Kartes noteikumu kampaņa atiestatīta', 'Kartes noteikumu kampaņas pakete sākta', 'Kartes noteikumu kampaņas paketes rezultāts']],
    ['en', ['Rejection email prepared', 'Rejection email delivery result', 'Card rules campaign reset', 'Card rules campaign batch started', 'Card rules campaign batch result']],
  ] as const)('names card mailing events in %s', (language, expected) => {
    const labels = getAdminActionLabels(language)
    const actions = ['access_request.rejection_email_prepared', 'access_request.rejection_email_recorded', 'card_rules_campaign.reset', 'card_rules_campaign.batch_started', 'card_rules_campaign.batch_completed'] as const
    expect(actions.map((action) => labels[action])).toEqual(expected)
  })

  it.each([
    ['ru', ['Подготовка рассылки', 'Результат рассылки', 'Подготовка отчёта по остаткам', 'Результат отправки отчёта по остаткам']],
    ['lv', ['Sagatavots e-pasta izsūtījums', 'E-pasta izsūtījuma rezultāts', 'Sagatavots krājumu pārskats', 'Krājumu pārskata nosūtīšanas rezultāts']],
    ['en', ['Broadcast prepared', 'Broadcast delivery result', 'Stock report prepared', 'Stock report delivery result']],
  ] as const)('names broadcast and stock report events in %s', (language, expected) => {
    const labels = getAdminActionLabels(language)
    const actions = ['broadcast.prepared', 'broadcast.delivery_recorded', 'stock_alert.report_prepared', 'stock_alert.report_recorded'] as const
    expect(actions.map((action) => labels[action])).toEqual(expected)
  })

  it.each([
    ['ru', ['Подготовка уведомления об акции', 'Результат уведомления об акции', 'Подготовка тестового письма шаблона', 'Результат тестового письма шаблона']],
    ['lv', ['Sagatavots akcijas paziņojums', 'Akcijas paziņojuma rezultāts', 'Sagatavota veidnes testa vēstule', 'Veidnes testa vēstules rezultāts']],
    ['en', ['Promo notification prepared', 'Promo notification result', 'Template test email prepared', 'Template test email result']],
  ] as const)('names promo and template test events in %s', (language, expected) => {
    const labels = getAdminActionLabels(language)
    const actions = ['product.promo_notification_prepared', 'product.promo_notification_recorded', 'email_template.test_prepared', 'email_template.test_recorded'] as const
    expect(actions.map((action) => labels[action])).toEqual(expected)
  })

  it.each([
    ['ru', 'Изменение шаблона письма'],
    ['lv', 'E-pasta veidne atjaunināta'],
    ['en', 'Email template updated'],
  ] as const)('names the email-template update event in %s', (language, expected) => {
    expect(getAdminActionLabels(language)['email_template.updated']).toBe(expected)
  })

  it.each([
    ['ru', ['Изменение групп баннеров', 'Создание баннера', 'Изменение баннера', 'Удаление баннера', 'Изменение порядка баннеров', 'Создание статьи', 'Изменение статьи', 'Удаление статьи', 'Создание кампании', 'Изменение кампании', 'Удаление кампании']],
    ['lv', ['Baneru grupas atjauninātas', 'Baneris izveidots', 'Baneris atjaunināts', 'Baneris dzēsts', 'Baneru secība mainīta', 'Raksts izveidots', 'Raksts atjaunināts', 'Raksts dzēsts', 'Kampaņa izveidota', 'Kampaņa atjaunināta', 'Kampaņa dzēsta']],
    ['en', ['Banner groups updated', 'Banner created', 'Banner updated', 'Banner deleted', 'Banner order changed', 'Blog post created', 'Blog post updated', 'Blog post deleted', 'Campaign created', 'Campaign updated', 'Campaign deleted']],
  ] as const)('names banner, blog and campaign events in %s', (language, expected) => {
    const labels = getAdminActionLabels(language)
    const actions = [
      'banner_groups.updated', 'banner.created', 'banner.updated', 'banner.deleted', 'banner.reordered',
      'blog.created', 'blog.updated', 'blog.deleted',
      'campaign.created', 'campaign.updated', 'campaign.deleted',
    ] as const
    expect(actions.map((action) => labels[action])).toEqual(expected)
  })
})
