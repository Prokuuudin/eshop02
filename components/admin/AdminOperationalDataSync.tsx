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
 * growing) is deliberately NOT loaded here anymore — it used to be, which meant
 * every admin page, including ones with nothing to do with orders, paid for a
 * full-table fetch on every session. Order data now hydrates on demand via
 * `useAdminOrdersSync()` (lib/use-admin-orders-sync.ts), called only by the
 * pages/components that actually read `useOrders` (orders list, sales
 * analytics/breakdown, bonus, returns, customer profile, marketing analytics,
 * ABC/cohort analytics).
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
