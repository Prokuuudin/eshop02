import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminLogAction =
  | 'order.status_changed'
  | 'order.bulk_status_changed'
  | 'order.note_saved'
  | 'order.updated'
  | 'order.payment_status_updated'
  | 'site_content.updated'
  | 'product.price_changed'
  | 'product.stock_changed'
  | 'product.deleted'
  | 'product.archived'
  | 'product.override_reset'
  | 'product.restored'
  | 'product.permanently_deleted'
  | 'product.created'
  | 'price_group.created'
  | 'price_group.updated'
  | 'price_group.deleted'
  | 'price_group.product_price_set'
  | 'price_group.product_price_removed'
  | 'settings.configuration_restored'
  | 'access_request.approved'
  | 'access_request.rejected'
  | 'media.uploaded'
  | 'media.replaced'
  | 'media.deleted'
  | 'invitation.created'
  | 'invitation.replaced'
  | 'invitation.delivery_recorded'
  | 'invitation.sms_recorded'
  | 'invitation.card_assigned'
  | 'access_request.rejection_email_prepared'
  | 'access_request.rejection_email_recorded'
  | 'card_rules_campaign.reset'
  | 'card_rules_campaign.batch_started'
  | 'card_rules_campaign.batch_completed'
  | 'broadcast.prepared'
  | 'broadcast.delivery_recorded'
  | 'stock_alert.report_prepared'
  | 'stock_alert.report_recorded'
  | 'product.promo_notification_prepared'
  | 'product.promo_notification_recorded'
  | 'email_template.test_prepared'
  | 'email_template.test_recorded'
  | 'promo.created'
  | 'promo.updated'
  | 'promo.deleted'
  | 'promo.toggled'
  | 'return.status_changed'
  | 'rfq.quote_sent'
  | 'rfq.status_changed'
  | 'review.status_changed'
  | 'review.deleted'

export type AdminLogEntry = {
  id: string
  at: Date
  adminEmail: string
  adminName?: string
  action: AdminLogAction
  entityType: string
  entityId: string
  entityTitle?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  details?: string
}

export const ACTION_LABELS: Record<AdminLogAction, string> = {
  'order.updated':             'Редактирование заказа',
  'order.payment_status_updated': 'Ручное изменение статуса оплаты',
  'site_content.updated':      'Обновление контента сайта',
  'order.status_changed':      'Смена статуса заказа',
  'order.bulk_status_changed': 'Массовая смена статуса',
  'order.note_saved':          'Заметка к заказу',
  'product.price_changed':     'Изменение цены',
  'product.stock_changed':     'Изменение остатка',
  'product.deleted':           'Удаление товара',
  'product.archived':          'Перенос товара в архив',
  'product.override_reset':    'Сброс переопределения товара',
  'product.restored':          'Восстановление товара',
  'product.permanently_deleted': 'Окончательное удаление товара',
  'product.created':           'Создание товара',
  'price_group.created':       'Создание ценовой группы',
  'price_group.updated':       'Изменение ценовой группы',
  'price_group.deleted':       'Удаление ценовой группы',
  'price_group.product_price_set': 'Установка индивидуальной цены',
  'price_group.product_price_removed': 'Снятие индивидуальной цены',
  'settings.configuration_restored': 'Восстановление конфигурации',
  'access_request.approved': 'Одобрение заявки на доступ',
  'access_request.rejected': 'Отклонение заявки на доступ',
  'media.uploaded': 'Загрузка медиафайла',
  'media.replaced': 'Замена медиафайла',
  'media.deleted': 'Удаление медиафайла',
  'invitation.created': 'Создание приглашения',
  'invitation.replaced': 'Замена приглашения',
  'invitation.delivery_recorded': 'Результат отправки приглашений',
  'invitation.sms_recorded': 'Запись SMS-приглашений',
  'invitation.card_assigned': 'Назначение карты клиенту',
  'access_request.rejection_email_prepared': 'Подготовка письма об отклонении заявки',
  'access_request.rejection_email_recorded': 'Результат письма об отклонении заявки',
  'card_rules_campaign.reset': 'Сброс рассылки правил карты',
  'card_rules_campaign.batch_started': 'Запуск пакета рассылки правил карты',
  'card_rules_campaign.batch_completed': 'Результат пакета рассылки правил карты',
  'broadcast.prepared': 'Подготовка рассылки',
  'broadcast.delivery_recorded': 'Результат рассылки',
  'stock_alert.report_prepared': 'Подготовка отчёта по остаткам',
  'stock_alert.report_recorded': 'Результат отправки отчёта по остаткам',
  'product.promo_notification_prepared': 'Подготовка уведомления об акции',
  'product.promo_notification_recorded': 'Результат уведомления об акции',
  'email_template.test_prepared': 'Подготовка тестового письма шаблона',
  'email_template.test_recorded': 'Результат тестового письма шаблона',
  'promo.created':             'Создание промокода',
  'promo.updated':             'Обновление промокода',
  'promo.deleted':             'Удаление промокода',
  'promo.toggled':             'Вкл/выкл промокода',
  'return.status_changed':     'Смена статуса возврата',
  'rfq.quote_sent':            'Отправка котировки',
  'rfq.status_changed':        'Смена статуса RFQ',
  'review.status_changed':     'Смена статуса отзыва',
  'review.deleted':            'Удаление отзыва',
}

const ACTION_LABELS_EN: Record<AdminLogAction, string> = {
  'order.updated': 'Order edited',
  'order.payment_status_updated': 'Payment status updated manually',
  'site_content.updated': 'Site content updated',
  'order.status_changed': 'Order status changed',
  'order.bulk_status_changed': 'Bulk status change',
  'order.note_saved': 'Order note saved',
  'product.price_changed': 'Price changed',
  'product.stock_changed': 'Stock changed',
  'product.deleted': 'Product deleted',
  'product.archived': 'Product moved to archive',
  'product.override_reset': 'Product override reset',
  'product.restored': 'Product restored',
  'product.permanently_deleted': 'Product permanently deleted',
  'product.created': 'Product created',
  'price_group.created': 'Price group created',
  'price_group.updated': 'Price group updated',
  'price_group.deleted': 'Price group deleted',
  'price_group.product_price_set': 'Custom product price set',
  'price_group.product_price_removed': 'Custom product price removed',
  'settings.configuration_restored': 'Configuration restored',
  'access_request.approved': 'Access request approved',
  'access_request.rejected': 'Access request rejected',
  'media.uploaded': 'Media file uploaded',
  'media.replaced': 'Media file replaced',
  'media.deleted': 'Media file deleted',
  'invitation.created': 'Invitation created',
  'invitation.replaced': 'Invitation replaced',
  'invitation.delivery_recorded': 'Invitation delivery result',
  'invitation.sms_recorded': 'SMS invitations recorded',
  'invitation.card_assigned': 'Customer card assigned',
  'access_request.rejection_email_prepared': 'Rejection email prepared',
  'access_request.rejection_email_recorded': 'Rejection email delivery result',
  'card_rules_campaign.reset': 'Card rules campaign reset',
  'card_rules_campaign.batch_started': 'Card rules campaign batch started',
  'card_rules_campaign.batch_completed': 'Card rules campaign batch result',
  'broadcast.prepared': 'Broadcast prepared',
  'broadcast.delivery_recorded': 'Broadcast delivery result',
  'stock_alert.report_prepared': 'Stock report prepared',
  'stock_alert.report_recorded': 'Stock report delivery result',
  'product.promo_notification_prepared': 'Promo notification prepared',
  'product.promo_notification_recorded': 'Promo notification result',
  'email_template.test_prepared': 'Template test email prepared',
  'email_template.test_recorded': 'Template test email result',
  'promo.created': 'Promo code created',
  'promo.updated': 'Promo code updated',
  'promo.deleted': 'Promo code deleted',
  'promo.toggled': 'Promo code enabled/disabled',
  'return.status_changed': 'Return status changed',
  'rfq.quote_sent': 'Quote sent',
  'rfq.status_changed': 'RFQ status changed',
  'review.status_changed': 'Review status changed',
  'review.deleted': 'Review deleted',
}

const ACTION_LABELS_LV: Record<AdminLogAction, string> = {
  'order.updated': 'Pasūtījums rediģēts',
  'order.payment_status_updated': 'Maksājuma statuss mainīts manuāli',
  'site_content.updated': 'Vietnes saturs atjaunināts',
  'order.status_changed': 'Pasūtījuma statuss mainīts',
  'order.bulk_status_changed': 'Masveida statusa maiņa',
  'order.note_saved': 'Pasūtījuma piezīme saglabāta',
  'product.price_changed': 'Cena mainīta',
  'product.stock_changed': 'Atlikums mainīts',
  'product.deleted': 'Produkts dzēsts',
  'product.archived': 'Produkts pārvietots uz arhīvu',
  'product.override_reset': 'Produkta pārrakstījums atiestatīts',
  'product.restored': 'Produkts atjaunots',
  'product.permanently_deleted': 'Produkts neatgriezeniski dzēsts',
  'product.created': 'Produkts izveidots',
  'price_group.created': 'Cenu grupa izveidota',
  'price_group.updated': 'Cenu grupa atjaunināta',
  'price_group.deleted': 'Cenu grupa dzēsta',
  'price_group.product_price_set': 'Individuālā cena iestatīta',
  'price_group.product_price_removed': 'Individuālā cena noņemta',
  'settings.configuration_restored': 'Konfigurācija atjaunota',
  'access_request.approved': 'Piekļuves pieteikums apstiprināts',
  'access_request.rejected': 'Piekļuves pieteikums noraidīts',
  'media.uploaded': 'Multivides fails augšupielādēts',
  'media.replaced': 'Multivides fails aizstāts',
  'media.deleted': 'Multivides fails dzēsts',
  'invitation.created': 'Ielūgums izveidots',
  'invitation.replaced': 'Ielūgums aizstāts',
  'invitation.delivery_recorded': 'Ielūgumu nosūtīšanas rezultāts',
  'invitation.sms_recorded': 'SMS ielūgumi reģistrēti',
  'invitation.card_assigned': 'Klientam piešķirta karte',
  'access_request.rejection_email_prepared': 'Sagatavota pieteikuma noraidījuma vēstule',
  'access_request.rejection_email_recorded': 'Pieteikuma noraidījuma vēstules rezultāts',
  'card_rules_campaign.reset': 'Kartes noteikumu kampaņa atiestatīta',
  'card_rules_campaign.batch_started': 'Kartes noteikumu kampaņas pakete sākta',
  'card_rules_campaign.batch_completed': 'Kartes noteikumu kampaņas paketes rezultāts',
  'broadcast.prepared': 'Sagatavots e-pasta izsūtījums',
  'broadcast.delivery_recorded': 'E-pasta izsūtījuma rezultāts',
  'stock_alert.report_prepared': 'Sagatavots krājumu pārskats',
  'stock_alert.report_recorded': 'Krājumu pārskata nosūtīšanas rezultāts',
  'product.promo_notification_prepared': 'Sagatavots akcijas paziņojums',
  'product.promo_notification_recorded': 'Akcijas paziņojuma rezultāts',
  'email_template.test_prepared': 'Sagatavota veidnes testa vēstule',
  'email_template.test_recorded': 'Veidnes testa vēstules rezultāts',
  'promo.created': 'Promokods izveidots',
  'promo.updated': 'Promokods atjaunināts',
  'promo.deleted': 'Promokods dzēsts',
  'promo.toggled': 'Promokods ieslēgts/izslēgts',
  'return.status_changed': 'Atgriešanas statuss mainīts',
  'rfq.quote_sent': 'Piedāvājums nosūtīts',
  'rfq.status_changed': 'RFQ statuss mainīts',
  'review.status_changed': 'Atsauksmes statuss mainīts',
  'review.deleted': 'Atsauksme dzēsta',
}

export function getAdminActionLabels(language: 'ru' | 'en' | 'lv'): Record<AdminLogAction, string> {
  return language === 'ru' ? ACTION_LABELS : language === 'lv' ? ACTION_LABELS_LV : ACTION_LABELS_EN
}

// ─── Store ────────────────────────────────────────────────────────────────────

type AdminLogStore = {
  entries: AdminLogEntry[]
  log: (
    action: AdminLogAction,
    entity: { type: string; id: string; title?: string },
    opts?: {
      before?: Record<string, unknown>
      after?: Record<string, unknown>
      details?: string
      adminEmail?: string
      adminName?: string
    }
  ) => void
  setEntries: (entries: AdminLogEntry[]) => void
}

export const useAdminLogStore = create<AdminLogStore>()(
    (set) => ({
      entries: [],

      log: (action, entity, opts) => {
        // Read current admin from localStorage (safe — only called in browser)
        let adminEmail = opts?.adminEmail ?? 'unknown'
        let adminName = opts?.adminName
        try {
          const raw = localStorage.getItem('eshop_current_user')
          if (raw) {
            const user = JSON.parse(raw) as { email?: string; name?: string }
            if (user.email) adminEmail = user.email
            if (user.name) adminName = user.name
          }
        } catch { /* ignore */ }

        const entry: AdminLogEntry = {
          id: `alog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          at: new Date(),
          adminEmail,
          adminName,
          action,
          entityType: entity.type,
          entityId: entity.id,
          entityTitle: entity.title,
          before: opts?.before,
          after: opts?.after,
          details: opts?.details,
        }

        set((state) => ({
          entries: [entry, ...state.entries].slice(0, 5000), // keep last 5000
        }))

        // Sync to DB — fire-and-forget
        // Only send fields the server accepts; id/adminEmail/adminName/at are server-generated
      },

      setEntries: (entries) => set({ entries }),
    })
)

/** Raw shape returned by GET /api/admin/audit-log (at as ISO string). */
type ServerLogRow = {
  id: string
  at: string
  adminEmail: string
  adminName?: string | null
  action: string
  entityType: string
  entityId: string
  entityTitle?: string | null
  before?: unknown
  after?: unknown
  details?: string | null
}

export function mapServerLogEntry(row: ServerLogRow): AdminLogEntry {
  return {
    id: row.id,
    at: new Date(row.at),
    adminEmail: row.adminEmail,
    adminName: row.adminName ?? undefined,
    action: row.action as AdminLogAction,
    entityType: row.entityType,
    entityId: row.entityId,
    entityTitle: row.entityTitle ?? undefined,
    before: (row.before as Record<string, unknown> | null) ?? undefined,
    after: (row.after as Record<string, unknown> | null) ?? undefined,
    details: row.details ?? undefined,
  }
}

// ─── Standalone helper (usable outside React) ─────────────────────────────────

export function logAdminAction(
  action: AdminLogAction,
  entity: { type: string; id: string; title?: string },
  opts?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    details?: string
  }
): void {
  useAdminLogStore.getState().log(action, entity, opts)
}
