import { create } from 'zustand'

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
  setRequests: (requests: RFQRequest[]) => void
}

export const useRFQStore = create<RFQStore>()(
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
        if (typeof window !== 'undefined') {
          fetch('/api/rfq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id,
              companyId: input.companyId,
              items: input.items,
              notes: input.notes,
              timeline: [{ at: now.toISOString(), type: 'created' }],
            }),
          }).catch(() => {})
        }
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
          const updatedTimeline = [...(existing.timeline ?? [{ at: new Date(existing.createdAt), type: 'created' }]), event]
          const next = new Map(state.requests)
          next.set(id, {
            ...existing,
            status: 'quoted',
            quote: { ...quote, createdAt: now },
            timeline: updatedTimeline,
            updatedAt: now,
          })
          if (typeof window !== 'undefined') {
            fetch(`/api/rfq/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'quoted',
                quote: { ...quote, validUntil: quote.validUntil instanceof Date ? quote.validUntil.toISOString() : quote.validUntil, createdAt: now.toISOString() },
                timeline: updatedTimeline.map((e) => ({ ...e, at: e.at instanceof Date ? e.at.toISOString() : e.at })),
              }),
            }).catch(() => {})
          }
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
          const updatedTimeline = [...(existing.timeline ?? [{ at: new Date(existing.createdAt), type: 'created' }]), event]
          const next = new Map(state.requests)
          next.set(id, {
            ...existing,
            status,
            timeline: updatedTimeline,
            updatedAt: now,
          })
          if (typeof window !== 'undefined') {
            fetch(`/api/rfq/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status,
                timeline: updatedTimeline.map((e) => ({ ...e, at: e.at instanceof Date ? e.at.toISOString() : e.at })),
              }),
            }).catch(() => {})
          }
          return { requests: next }
        })
      },

      addNote: (id, note) => {
        set((state) => {
          const existing = state.requests.get(id)
          if (!existing || !note.trim()) return state
          const now = new Date()
          const event: RFQTimelineEvent = { at: now, type: 'note', note: note.trim() }
          const updatedTimeline = [...(existing.timeline ?? []), event]
          const next = new Map(state.requests)
          next.set(id, {
            ...existing,
            timeline: updatedTimeline,
            updatedAt: now,
          })
          if (typeof window !== 'undefined') {
            fetch(`/api/rfq/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                notes: note.trim(),
                timeline: updatedTimeline.map((e) => ({ ...e, at: e.at instanceof Date ? e.at.toISOString() : e.at })),
              }),
            }).catch(() => {})
          }
          return { requests: next }
        })
      },

      setRequests: (requests) => {
        set({ requests: new Map(requests.map((r) => [r.id, r])) })
      },
    })
)

/** Raw shape returned by GET/PATCH /api/rfq (dates as ISO strings, quote/timeline as JSON). */
type ServerRfqRow = {
  id: string
  companyId: string
  items: unknown
  notes: string
  status: string
  quote?: unknown
  timeline?: unknown
  createdAt: string
  updatedAt: string
  createdByUserId?: string | null
}

export function mapServerRfq(row: ServerRfqRow): RFQRequest {
  const quote = row.quote as { validUntil: string; totalPrice: number; terms: string; createdAt: string } | null | undefined
  const timeline = Array.isArray(row.timeline) ? (row.timeline as Array<Record<string, unknown>>) : []

  return {
    id: row.id,
    companyId: row.companyId,
    items: Array.isArray(row.items) ? (row.items as RFQItem[]) : [],
    notes: row.notes ?? '',
    status: row.status as RFQStatus,
    quote: quote
      ? {
          validUntil: new Date(quote.validUntil),
          totalPrice: quote.totalPrice,
          terms: quote.terms,
          createdAt: new Date(quote.createdAt),
        }
      : undefined,
    timeline: timeline.map((e) => ({
      at: new Date(e.at as string),
      type: e.type as RFQTimelineEvent['type'],
      note: e.note as string | undefined,
      quotePrice: e.quotePrice as number | undefined,
      quoteTerms: e.quoteTerms as string | undefined,
      quoteValidUntil: e.quoteValidUntil ? new Date(e.quoteValidUntil as string) : undefined,
    })),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    createdByUserId: row.createdByUserId ?? undefined,
  }
}
