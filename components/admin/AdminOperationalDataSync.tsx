'use client'

import { useEffect } from 'react'
import { useOrders, type Order } from '@/lib/orders-store'
import { useAdminStore } from '@/lib/admin-store'
import { useCompanyStore } from '@/lib/company-store'
import { reportAdminError, reportAdminPartial } from '@/lib/admin-ui-errors'

const PAGE_SIZE = 200

async function loadAllAdminOrders(signal: AbortSignal): Promise<Order[]> {
  const orders: Order[] = []
  let skip = 0

  for (;;) {
    const response = await fetch(`/api/admin/orders?skip=${skip}&take=${PAGE_SIZE}`, {
      cache: 'no-store',
      signal,
    })
    if (!response.ok) throw new Error(`orders_sync_failed:${response.status}`)
    const payload = (await response.json()) as { orders?: Order[]; total?: number }
    const page = Array.isArray(payload.orders) ? payload.orders : []
    orders.push(...page)
    const total = typeof payload.total === 'number' ? payload.total : orders.length
    if (orders.length >= total || page.length < PAGE_SIZE) return orders
    skip += page.length
  }
}

/**
 * Hydrates non-persisted Zustand caches from PostgreSQL for admin consumers.
 * Cache state is replaced, never merged with data left by another browser session.
 */
export default function AdminOperationalDataSync(): null {
  useEffect(() => {
    const controller = new AbortController()

    void loadAllAdminOrders(controller.signal)
      .then(async (orders) => {
        useOrders.getState().replaceOrders(orders)
        useAdminStore.getState().clearOrderMeta()
        await useAdminStore.getState().loadOrderMeta(orders.map((order) => order.id))
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          useOrders.getState().clearOrders()
          useAdminStore.getState().clearOrderMeta()
          reportAdminError(new Error('orders_sync_failed'), 'Заказы и операционные показатели')
        }
      })

    void fetch('/api/bonus-config', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((config) => { if (config) useAdminStore.getState().setBonusProgram(config) })
      .catch(() => { if (!controller.signal.aborted) reportAdminPartial('Заказы загружены, но настройки бонусной программы недоступны.', 'Операционные данные') })

    void useCompanyStore.getState().syncFromDb().catch((error) => reportAdminError(error, 'Компании и участники'))

    return () => controller.abort()
  }, [])

  return null
}
