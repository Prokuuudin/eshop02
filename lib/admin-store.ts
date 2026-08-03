import { create } from 'zustand'

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

import { DEFAULT_BONUS_PROGRAM_CONFIG, type BonusProgramConfig } from '@/lib/bonus-program'

export { DEFAULT_BONUS_PROGRAM_CONFIG }
export type { BonusProgramConfig }

type AdminStore = {
  orderStatuses: Record<string, OrderStatus>
  orderNotes: Record<string, string>
  bonusProgram: BonusProgramConfig
  cardOrder: string[] | null
  setOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>
  getOrderStatus: (orderId: string) => OrderStatus
  setOrderNote: (orderId: string, note: string) => Promise<void>
  getOrderNote: (orderId: string) => string
  updateBonusProgram: (nextConfig: Partial<BonusProgramConfig>) => Promise<BonusProgramConfig>
  setBonusProgram: (config: BonusProgramConfig) => void
  setCardOrder: (order: string[]) => void
  resetCardOrder: () => void
  loadOrderMeta: (orderIds: string[]) => Promise<void>
  clearOrderMeta: () => void
}

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

// Без Math.round — ставка начисления дробная (0.5%).
const clampFloat = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export const useAdminStore = create<AdminStore>()(
    (set, get) => ({
      orderStatuses: {},
      orderNotes: {},
      bonusProgram: DEFAULT_BONUS_PROGRAM_CONFIG,
      cardOrder: null,
      clearOrderMeta: () => set({ orderStatuses: {}, orderNotes: {} }),

      setOrderStatus: async (orderId: string, status: OrderStatus) => {
        const res = await fetch('/api/admin/order-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, status }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'status_update_failed')
        set((state) => ({ orderStatuses: { ...state.orderStatuses, [orderId]: status } }))
      },

      getOrderStatus: (orderId: string) => {
        return get().orderStatuses[orderId] || 'pending'
      },

      setOrderNote: async (orderId: string, note: string) => {
        const res = await fetch('/api/admin/order-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, note }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'note_update_failed')
        set((state) => ({ orderNotes: { ...state.orderNotes, [orderId]: note } }))
      },

      getOrderNote: (orderId: string) => {
        return get().orderNotes[orderId] ?? ''
      },

      setCardOrder: (order: string[]) => set({ cardOrder: order }),
      resetCardOrder: () => set({ cardOrder: null }),

      loadOrderMeta: async (orderIds: string[]) => {
        if (!orderIds.length) return
        try {
          const ids = orderIds.slice(0, 200).join(',')
          const res = await fetch(`/api/admin/order-meta?ids=${ids}`)
          if (!res.ok) return
          const { statuses, notes } = await res.json()
          set((state) => ({
            orderStatuses: { ...state.orderStatuses, ...statuses },
            orderNotes: { ...state.orderNotes, ...notes },
          }))
        } catch { /* ignore */ }
      },

      updateBonusProgram: (nextConfig: Partial<BonusProgramConfig>) => {
        const current = get().bonusProgram
        const requested: BonusProgramConfig = {
          enabled: nextConfig.enabled ?? current.enabled,
          earnRatePercent: clampFloat(nextConfig.earnRatePercent ?? current.earnRatePercent, 0, 100),
          maxSpendPercent: clamp(nextConfig.maxSpendPercent ?? current.maxSpendPercent, 0, 100),
          minOrderForEarn: clamp(nextConfig.minOrderForEarn ?? current.minOrderForEarn, 0, 1_000_000),
          pointsExpiryDays: clamp(nextConfig.pointsExpiryDays ?? current.pointsExpiryDays, 0, 3650),
          minPointsToSpend: clamp(nextConfig.minPointsToSpend ?? current.minPointsToSpend, 0, 1_000_000),
          maxEarnPerOrder: clamp(nextConfig.maxEarnPerOrder ?? current.maxEarnPerOrder, 0, 1_000_000),
        }
        return fetch('/api/admin/bonus-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requested),
        }).then(async (response) => {
          if (!response.ok) throw new Error('bonus_config_save_failed')
          const saved = await response.json() as BonusProgramConfig
          set({ bonusProgram: saved })
          return saved
        })
      },

      setBonusProgram: (config: BonusProgramConfig) => set({ bonusProgram: config }),
    })
)
