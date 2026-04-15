import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RFQStatus = 'pending' | 'quoted' | 'accepted' | 'rejected'

export type RFQItem = {
  productId: string
  quantity: number
}

export type RFQQuote = {
  validUntil: Date
  totalPrice: number
  terms: string
  createdAt: Date
}

export type RFQRequest = {
  id: string
  companyId: string
  items: RFQItem[]
  notes: string
  status: RFQStatus
  quote?: RFQQuote
  createdAt: Date
  updatedAt: Date
  createdByUserId?: string
}

type RFQStore = {
  requests: Map<string, RFQRequest>
  createRequest: (input: Omit<RFQRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => string
  getRequest: (id: string) => RFQRequest | undefined
  getByCompany: (companyId: string) => RFQRequest[]
  getAll: () => RFQRequest[]
  setQuote: (id: string, quote: Omit<RFQQuote, 'createdAt'>) => void
  setStatus: (id: string, status: RFQStatus) => void
}

export const useRFQStore = create<RFQStore>()(
  persist(
    (set, get) => ({
      requests: new Map(),

      createRequest: (input) => {
        const id = `rfq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const now = new Date()
        const request: RFQRequest = {
          ...input,
          id,
          status: 'pending',
          createdAt: now,
          updatedAt: now
        }

        set((state) => {
          const next = new Map(state.requests)
          next.set(id, request)
          return { requests: next }
        })

        return id
      },

      getRequest: (id) => get().requests.get(id),

      getByCompany: (companyId) => {
        return Array.from(get().requests.values())
          .filter((item) => item.companyId === companyId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      },

      getAll: () => {
        return Array.from(get().requests.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      },

      setQuote: (id, quote) => {
        set((state) => {
          const existing = state.requests.get(id)
          if (!existing) return state

          const next = new Map(state.requests)
          next.set(id, {
            ...existing,
            status: 'quoted',
            quote: {
              ...quote,
              createdAt: new Date()
            },
            updatedAt: new Date()
          })
          return { requests: next }
        })
      },

      setStatus: (id, status) => {
        set((state) => {
          const existing = state.requests.get(id)
          if (!existing) return state

          const next = new Map(state.requests)
          next.set(id, {
            ...existing,
            status,
            updatedAt: new Date()
          })
          return { requests: next }
        })
      }
    }),
    {
      name: 'rfq-store',
      partialize: (state) => ({
        requests: Array.from(state.requests.entries())
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        requests: new Map(persistedState?.requests || [])
      })
    }
  )
)
