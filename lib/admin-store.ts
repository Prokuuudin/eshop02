import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

import { DEFAULT_BONUS_PROGRAM_CONFIG, type BonusProgramConfig } from '@/lib/bonus-program'

export { DEFAULT_BONUS_PROGRAM_CONFIG }
export type { BonusProgramConfig }

type AdminStore = {
  orderStatuses: Record<string, OrderStatus>
  orderNotes: Record<string, string>
  bonusProgram: BonusProgramConfig
  cardOrder: string[] | null
  setOrderStatus: (orderId: string, status: OrderStatus) => void
  getOrderStatus: (orderId: string) => OrderStatus
  setOrderNote: (orderId: string, note: string) => void
  getOrderNote: (orderId: string) => string
  updateBonusProgram: (nextConfig: Partial<BonusProgramConfig>) => void
  setCardOrder: (order: string[]) => void
  resetCardOrder: () => void
  loadOrderMeta: (orderIds: string[]) => Promise<void>
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
  persist(
    (set, get) => ({
      orderStatuses: {},
      orderNotes: {},
      bonusProgram: DEFAULT_BONUS_PROGRAM_CONFIG,
      cardOrder: null,

      setOrderStatus: (orderId: string, status: OrderStatus) => {
        set((state) => ({
          orderStatuses: { ...state.orderStatuses, [orderId]: status }
        }))
        if (typeof window !== 'undefined') {
          fetch('/api/admin/order-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, status }),
          }).catch(() => {})
        }
      },

      getOrderStatus: (orderId: string) => {
        return get().orderStatuses[orderId] || 'pending'
      },

      setOrderNote: (orderId: string, note: string) => {
        set((state) => ({
          orderNotes: { ...state.orderNotes, [orderId]: note }
        }))
        if (typeof window !== 'undefined') {
          fetch('/api/admin/order-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, note }),
          }).catch(() => {})
        }
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
            orderStatuses: { ...statuses, ...state.orderStatuses },
            orderNotes: { ...notes, ...state.orderNotes },
          }))
        } catch { /* ignore */ }
      },

      updateBonusProgram: (nextConfig: Partial<BonusProgramConfig>) => {
        set((state) => ({
          bonusProgram: {
            enabled: nextConfig.enabled ?? state.bonusProgram.enabled,
            earnRatePercent: clampFloat(nextConfig.earnRatePercent ?? state.bonusProgram.earnRatePercent, 0, 100),
            maxSpendPercent: clamp(nextConfig.maxSpendPercent ?? state.bonusProgram.maxSpendPercent, 0, 100),
            minOrderForEarn: clamp(nextConfig.minOrderForEarn ?? state.bonusProgram.minOrderForEarn, 0, 1_000_000),
            pointsExpiryDays: clamp(nextConfig.pointsExpiryDays ?? state.bonusProgram.pointsExpiryDays, 0, 3650),
            minPointsToSpend: clamp(nextConfig.minPointsToSpend ?? state.bonusProgram.minPointsToSpend, 0, 1_000_000),
            maxEarnPerOrder: clamp(nextConfig.maxEarnPerOrder ?? state.bonusProgram.maxEarnPerOrder, 0, 1_000_000),
          }
        }))
      }
    }),
    {
      name: 'admin-store',
      // v1: earnRatePercent 5 -> 0.5; в localStorage старых браузеров лежит 5,
      // и без миграции оно перекрывает новый дефолт.
      version: 1,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Record<string, unknown>
        if (version < 1) {
          return { ...state, bonusProgram: DEFAULT_BONUS_PROGRAM_CONFIG }
        }
        return state
      },
    }
  )
)
