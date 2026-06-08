import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminLogAction =
  | 'order.status_changed'
  | 'order.bulk_status_changed'
  | 'order.note_saved'
  | 'product.price_changed'
  | 'product.stock_changed'
  | 'product.deleted'
  | 'product.created'
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
  'order.status_changed':      'Смена статуса заказа',
  'order.bulk_status_changed': 'Массовая смена статуса',
  'order.note_saved':          'Заметка к заказу',
  'product.price_changed':     'Изменение цены',
  'product.stock_changed':     'Изменение остатка',
  'product.deleted':           'Удаление товара',
  'product.created':           'Создание товара',
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
  clear: (olderThanDays: number) => void
}

export const useAdminLogStore = create<AdminLogStore>()(
  persist(
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
        if (typeof window !== 'undefined') {
          fetch('/api/admin/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: entry.action,
              entityType: entry.entityType,
              entityId: entry.entityId,
              entityTitle: entry.entityTitle,
              before: entry.before,
              after: entry.after,
              details: entry.details,
            }),
          }).catch(() => {})
        }
      },

      clear: (olderThanDays) => {
        const cutoff = Date.now() - olderThanDays * 86400_000
        set((state) => ({
          entries: state.entries.filter((e) => new Date(e.at).getTime() >= cutoff),
        }))
      },
    }),
    {
      name: 'admin-action-log',
    }
  )
)

// ─── Standalone helper (usable outside React) ─────────────────────────────────

export function logAdminAction(
  action: AdminLogAction,
  entity: { type: string; id: string; title?: string },
  opts?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    details?: string
  }
) {
  useAdminLogStore.getState().log(action, entity, opts)
}
