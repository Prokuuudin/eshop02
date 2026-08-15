import { mapServerReturn, type ReturnRequest } from '@/lib/returns-store'

/**
 * Fetches a single customer's returns directly from the API, scoped server-side
 * via `?email=`. Deliberately independent of `useReturnsStore` — that store is
 * only hydrated by the separate /admin/returns page's own effect, so relying on
 * it here would leave this tab empty when an admin opens a customer profile
 * without having visited /admin/returns earlier in the same session.
 */
export async function fetchCustomerReturns(email: string, take = 200): Promise<ReturnRequest[]> {
  const res = await fetch(`/api/returns?email=${encodeURIComponent(email)}&take=${take}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json()) as { returns?: Array<Parameters<typeof mapServerReturn>[0]> }
  return Array.isArray(body.returns) ? body.returns.map(mapServerReturn) : []
}
