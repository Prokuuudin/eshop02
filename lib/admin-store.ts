import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

export interface BonusProgramConfig {
  enabled: boolean
  earnRatePercent: number
  maxSpendPercent: number
  minOrderForEarn: number
}

export const DEFAULT_BONUS_PROGRAM_CONFIG: BonusProgramConfig = {
  enabled: true,
  earnRatePercent: 5,
  maxSpendPercent: 100,
  minOrderForEarn: 0
}

type AdminStore = {
  orderStatuses: Record<string, OrderStatus>
  bonusProgram: BonusProgramConfig
  setOrderStatus: (orderId: string, status: OrderStatus) => void
  getOrderStatus: (orderId: string) => OrderStatus
  updateBonusProgram: (nextConfig: Partial<BonusProgramConfig>) => void
}

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export const useAdminStore = create<AdminStore>()(
  persist(
    (set, get) => ({
      orderStatuses: {},
      bonusProgram: DEFAULT_BONUS_PROGRAM_CONFIG,

      setOrderStatus: (orderId: string, status: OrderStatus) => {
        set((state) => ({
          orderStatuses: {
            ...state.orderStatuses,
            [orderId]: status
          }
        }))
      },

      getOrderStatus: (orderId: string) => {
        return get().orderStatuses[orderId] || 'pending'
      },

      updateBonusProgram: (nextConfig: Partial<BonusProgramConfig>) => {
        set((state) => ({
          bonusProgram: {
            enabled: nextConfig.enabled ?? state.bonusProgram.enabled,
            earnRatePercent: clamp(nextConfig.earnRatePercent ?? state.bonusProgram.earnRatePercent, 0, 100),
            maxSpendPercent: clamp(nextConfig.maxSpendPercent ?? state.bonusProgram.maxSpendPercent, 0, 100),
            minOrderForEarn: clamp(nextConfig.minOrderForEarn ?? state.bonusProgram.minOrderForEarn, 0, 1_000_000)
          }
        }))
      }
    }),
    {
      name: 'admin-store'
    }
  )
)
