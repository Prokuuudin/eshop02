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

export type RFQTimelineEvent = {
  at: Date
  type: 'created' | 'quote_sent' | 'accepted' | 'rejected' | 'note'
  note?: string
  quotePrice?: number
  quoteTerms?: string
  quoteValidUntil?: Date
}

export type RFQRequest = {
  id: string
  companyId: string
  items: RFQItem[]
  notes: string
  status: RFQStatus
  quote?: RFQQuote
  timeline: RFQTimelineEvent[]
  createdAt: Date
  updatedAt: Date
  createdByUserId?: string
}

// Build a minimal timeline for legacy records that don't have one
function ensureTimeline(r: RFQRequest): RFQRequest {
  if (r.timeline?.length) return r
  const events: RFQTimelineEvent[] = [
    { at: new Date(r.createdAt), type: 'created' },
  ]
  if (r.quote?.createdAt) {
    events.push({
      at: new Date(r.quote.createdAt),
      type: 'quote_sent',
      quotePrice: r.quote.totalPrice,
      quoteTerms: r.quote.terms,
      quoteValidUntil: new Date(r.quote.validUntil),
    })
  }
  if (r.status === 'accepted') {
    events.push({ at: new Date(r.updatedAt), type: 'accepted' })
  }
  if (r.status === 'rejected') {
    events.push({ at: new Date(r.updatedAt), type: 'rejected' })
  }
  return { ...r, timeline: events }
}

type RFQStore = {
  requests: Map<string, RFQRequest>
  createRequest: (input: Omit<RFQRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'timeline'>) => string
  getRequest: (id: string) => RFQRequest | undefined
  getByCompany: (companyId: string) => RFQRequest[]
  getAll: () => RFQRequest[]
  setQuote: (id: string, quote: Omit<RFQQuote, 'createdAt'>) => void
  setStatus: (id: string, status: RFQStatus, note?: string) => void
  addNote: (id: string, note: string) => void
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
          timeline: [{ at: now, type: 'created' }],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => {
          const next = new Map(state.requests)
          next.set(id, request)
          return { requests: next }
        })
        return id
      },

      getRequest: (id) => {
        const r = get().requests.get(id)
        return r ? ensureTimeline(r) : undefined
      },

      getByCompany: (companyId) => {
        return Array.from(get().requests.values())
          .filter((item) => item.companyId === companyId)
          .map(ensureTimeline)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      },

      getAll: () => {
        return Array.from(get().requests.values())
          .map(ensureTimeline)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      },

      setQuote: (id, quote) => {
        set((state) => {
          const existing = state.requests.get(id)
          if (!existing) return state
          const now = new Date()
          const event: RFQTimelineEvent = {
            at: now,
            type: 'quote_sent',
            quotePrice: quote.totalPrice,
            quoteTerms: quote.terms,
            quoteValidUntil: quote.validUntil,
          }
          const next = new Map(state.requests)
          next.set(id, {
            ...existing,
            status: 'quoted',
            quote: { ...quote, createdAt: now },
            timeline: [...(existing.timeline ?? [{ at: new Date(existing.createdAt), type: 'created' }]), event],
            updatedAt: now,
          })
          return { requests: next }
        })
      },

      setStatus: (id, status, note) => {
        set((state) => {
          const existing = state.requests.get(id)
          if (!existing) return state
          const now = new Date()
          const event: RFQTimelineEvent = {
            at: now,
            type: status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'note',
            ...(note ? { note } : {}),
          }
          const next = new Map(state.requests)
          next.set(id, {
            ...existing,
            status,
            timeline: [...(existing.timeline ?? [{ at: new Date(existing.createdAt), type: 'created' }]), event],
            updatedAt: now,
          })
          return { requests: next }
        })
      },

      addNote: (id, note) => {
        set((state) => {
          const existing = state.requests.get(id)
          if (!existing || !note.trim()) return state
          const now = new Date()
          const event: RFQTimelineEvent = { at: now, type: 'note', note: note.trim() }
          const next = new Map(state.requests)
          next.set(id, {
            ...existing,
            timeline: [...(existing.timeline ?? []), event],
            updatedAt: now,
          })
          return { requests: next }
        })
      },
    }),
    {
      name: 'rfq-store',
      partialize: (state) => ({
        requests: Array.from(state.requests.entries()),
      }),
      merge: (persistedState: unknown, currentState) => {
        const ps = persistedState as { requests?: [string, RFQRequest][] } | null
        return {
          ...currentState,
          requests: new Map(ps?.requests ?? []),
        }
      },
    }
  )
)
