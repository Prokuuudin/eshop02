'use client'

import { useEffect } from 'react'
import { useAdminStore } from '@/lib/admin-store'
import { useCompanyStore } from '@/lib/company-store'
import { reportAdminError, reportAdminPartial } from '@/lib/admin-ui-errors'

/**
 * Hydrates non-persisted Zustand caches from PostgreSQL for admin consumers.
 * Cache state is replaced, never merged with data left by another browser session.
 *
 * Mounted once for the whole /admin section (app/[lang]/admin/layout.tsx) because
 * these two fetches are cheap, single requests needed widely across admin pages
 * (bonus config, company/team data). The FULL order table (~8,700+ rows and
 * growing) is NOT loaded here, or anywhere else in the admin — every page that
 * used to sync the whole table client-side (orders list, sales
 * analytics/breakdown, bonus, returns, customer profile, marketing analytics,
 * ABC/cohort analytics, the dashboard KPIs, the global Ctrl+K search) now
 * calls a dedicated server-side aggregation/search endpoint instead
 * (app/api/admin/orders, /orders/stats, /sales/*, /analytics/*, /bonus/stats,
 * /marketing/analytics). The old `useAdminOrdersSync()` full-sync hook was
 * removed for the same reason; the `useOrders` Zustand store still exists,
 * but only for the storefront's own per-user order flows (checkout, account),
 * which are unrelated to and much smaller than the admin's full order table.
 */
export default function AdminOperationalDataSync(): null {
  useEffect(() => {
    const controller = new AbortController()

    void fetch('/api/bonus-config', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((config) => { if (config) useAdminStore.getState().setBonusProgram(config) })
      .catch(() => { if (!controller.signal.aborted) reportAdminPartial('Настройки бонусной программы временно недоступны.', 'Операционные данные') })

    void useCompanyStore.getState().syncFromDb().catch((error) => reportAdminError(error, 'Компании и участники'))

    return () => controller.abort()
  }, [])

  return null
}
