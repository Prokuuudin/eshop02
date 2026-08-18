'use client'

import { useEffect } from 'react'
import { useOrders, type Order } from '@/lib/orders-store'
import { useAdminStore } from '@/lib/admin-store'
import { reportAdminError } from '@/lib/admin-ui-errors'

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

// Module-level (not React state) so concurrent callers from different admin
// pages share the same in-flight request instead of each starting their own
// full-table fetch, and so the fetch survives a caller unmounting (e.g. the
// user navigates to another order-consuming page before it finishes).
let inFlight: Promise<void> | null = null

function startOrdersSync(): Promise<void> {
  if (inFlight) return inFlight

  useOrders.getState().setHydrationStatus('loading')
  inFlight = loadAllAdminOrders(new AbortController().signal)
    .then(async (orders) => {
      useOrders.getState().replaceOrders(orders)
      useOrders.getState().setHydrationStatus('loaded')
      useAdminStore.getState().clearOrderMeta()
      await useAdminStore.getState().loadOrderMeta(orders.map((order) => order.id))
    })
    .catch(() => {
      useOrders.getState().clearOrders()
      useOrders.getState().setHydrationStatus('error')
      useAdminStore.getState().clearOrderMeta()
      reportAdminError(new Error('orders_sync_failed'), 'Заказы и операционные показатели')
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/**
 * Ensures the full admin orders table (+ per-order status/note metadata) is
 * hydrated into the shared `useOrders` store.
 *
 * Call this hook ONLY from admin pages/components that actually read the full
 * order list via `useOrders` (orders list, sales analytics/breakdown, bonus,
 * returns, customer profile, marketing analytics, ABC/cohort analytics).
 * Pages that don't consume order data (design-system, content, config, brands,
 * etc.) must NOT call it — that was the whole bug: a previous version of this
 * fetch ran unconditionally for every /admin page via the shared layout,
 * loading ~8,700+ orders into the browser even on pages that never use them.
 *
 * The fetch itself runs at most once per browser session (tracked via
 * `useOrders().hydrationStatus`); every additional caller — including ones
 * mounting after the first fetch already completed — just reuses the
 * already-hydrated store instead of re-fetching.
 */
export function useAdminOrdersSync(options?: { refreshIfLoaded?: boolean }): void {
  const refreshIfLoaded = options?.refreshIfLoaded ?? false
  useEffect(() => {
    const status = useOrders.getState().hydrationStatus
    if (status === 'idle' || status === 'error' || refreshIfLoaded) {
      void startOrdersSync()
    }
  }, [refreshIfLoaded])
}
