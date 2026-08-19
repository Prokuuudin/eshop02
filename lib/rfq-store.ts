import { create } from 'zustand'

export type RFQStatus = 'pending' | 'quoted' | 'accepted' | 'rejected'

export type RFQItem = {
  productId: string
  quantity: number
  title?: string
  sku?: string
  listPrice?: number
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
  internal?: boolean
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
  companyName?: string
  contactEmail?: string
  contactPhone?: string
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
  createRequest: (input: Omit<RFQRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'timeline'>) => Promise<{ id: string; ok: boolean }>
  getRequest: (id: string) => RFQRequest | undefined
  getByCompany: (companyId: string) => RFQRequest[]
  getAll: () => RFQRequest[]
  setQuote: (id: string, quote: Omit<RFQQuote, 'createdAt'>) => Promise<boolean>
  setStatus: (id: string, status: 'accepted' | 'rejected') => Promise<boolean>
  addNote: (id: string, note: string) => Promise<boolean>
  setRequests: (requests: RFQRequest[]) => void
}

export const useRFQStore = create<RFQStore>()(
    (set, get) => ({
      requests: new Map(),

      createRequest: async (input) => {
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
        const previous = get().requests
        set((state) => {
          const next = new Map(state.requests)
          next.set(id, request)
          return { requests: next }
        })
        try {
          const res = await fetch('/api/rfq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id,
              companyId: input.companyId,
              items: input.items,
              notes: input.notes,
            }),
          })
          if (!res.ok) throw new Error(`create rfq failed: ${res.status}`)
          const body = typeof res.json === 'function' ? await res.json().catch(() => null) as { request?: ServerRfqRow } | null : null
          if (body?.request) {
            const saved = mapServerRfq(body.request)
            set((state) => {
              const next = new Map(state.requests)
              next.delete(id)
              next.set(saved.id, saved)
              return { requests: next }
            })
          }
          return { id, ok: true }
        } catch {
          set({ requests: previous })
          return { id, ok: false }
        }
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

      setQuote: async (id, quote) => {
        const previous = get().requests
        const existing = previous.get(id)
        if (!existing) return false
        const now = new Date()
        const event: RFQTimelineEvent = {
          at: now,
          type: 'quote_sent',
          quotePrice: quote.totalPrice,
          quoteTerms: quote.terms,
          quoteValidUntil: quote.validUntil,
        }
        const updatedTimeline = [...(existing.timeline ?? [{ at: new Date(existing.createdAt), type: 'created' }]), event]
        const next = new Map(previous)
        next.set(id, {
          ...existing,
          status: 'quoted',
          quote: { ...quote, createdAt: now },
          timeline: updatedTimeline,
          updatedAt: now,
        })
        set({ requests: next })
        try {
          const res = await fetch(`/api/rfq/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'quote', quote: { ...quote, validUntil: quote.validUntil instanceof Date ? quote.validUntil.toISOString() : quote.validUntil } }),
          })
          if (!res.ok) throw new Error(`set quote failed: ${res.status}`)
          const body = typeof res.json === 'function' ? await res.json().catch(() => null) as { request?: ServerRfqRow } | null : null
          if (body?.request) {
            const saved = mapServerRfq(body.request)
            set((state) => ({ requests: new Map(state.requests).set(id, { ...saved, companyName: existing.companyName, contactEmail: existing.contactEmail, contactPhone: existing.contactPhone }) }))
          }
          return true
        } catch {
          set({ requests: previous })
          return false
        }
      },

      setStatus: async (id, status) => {
        const previous = get().requests
        const existing = previous.get(id)
        if (!existing) return false
        const now = new Date()
        const event: RFQTimelineEvent = {
          at: now,
          type: status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'note',
        }
        const updatedTimeline = [...(existing.timeline ?? [{ at: new Date(existing.createdAt), type: 'created' }]), event]
        const next = new Map(previous)
        next.set(id, {
          ...existing,
          status,
          timeline: updatedTimeline,
          updatedAt: now,
        })
        set({ requests: next })
        try {
          const res = await fetch(`/api/rfq/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'respond', decision: status }),
          })
          if (!res.ok) throw new Error(`set status failed: ${res.status}`)
          const body = typeof res.json === 'function' ? await res.json().catch(() => null) as { request?: ServerRfqRow } | null : null
          if (body?.request) {
            const saved = mapServerRfq(body.request)
            set((state) => ({ requests: new Map(state.requests).set(id, { ...saved, companyName: existing.companyName, contactEmail: existing.contactEmail, contactPhone: existing.contactPhone }) }))
          }
          return true
        } catch {
          set({ requests: previous })
          return false
        }
      },

      addNote: async (id, note) => {
        const previous = get().requests
        const existing = previous.get(id)
        if (!existing || !note.trim()) return false
        const now = new Date()
        const event: RFQTimelineEvent = { at: now, type: 'note', note: note.trim() }
        const updatedTimeline = [...(existing.timeline ?? []), event]
        const next = new Map(previous)
        next.set(id, {
          ...existing,
          timeline: updatedTimeline,
          updatedAt: now,
        })
        set({ requests: next })
        try {
          const res = await fetch(`/api/rfq/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_internal_note', note: note.trim() }),
          })
          if (!res.ok) throw new Error(`add note failed: ${res.status}`)
          const body = typeof res.json === 'function' ? await res.json().catch(() => null) as { request?: ServerRfqRow } | null : null
          if (body?.request) {
            const saved = mapServerRfq(body.request)
            set((state) => ({ requests: new Map(state.requests).set(id, { ...saved, companyName: existing.companyName, contactEmail: existing.contactEmail, contactPhone: existing.contactPhone }) }))
          }
          return true
        } catch {
          set({ requests: previous })
          return false
        }
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
  companyName?: string
  contactEmail?: string
  contactPhone?: string
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
      internal: e.internal === true,
      quotePrice: e.quotePrice as number | undefined,
      quoteTerms: e.quoteTerms as string | undefined,
      quoteValidUntil: e.quoteValidUntil ? new Date(e.quoteValidUntil as string) : undefined,
    })),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    createdByUserId: row.createdByUserId ?? undefined,
    companyName: row.companyName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
  }
}
