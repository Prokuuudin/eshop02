import { create } from 'zustand'

export type ReturnStatus = 'pending' | 'approved' | 'rejected' | 'refunded' | 'completed'

export type ReturnReason =
  | 'defective'
  | 'wrong_item'
  | 'changed_mind'
  | 'not_as_described'
  | 'damaged'
  | 'other'

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  defective: 'Брак / неисправность',
  wrong_item: 'Не тот товар',
  changed_mind: 'Передумал',
  not_as_described: 'Не соответствует описанию',
  damaged: 'Повреждение при доставке',
  other: 'Другое',
}

export interface ReturnItem {
  productId: string
  title: string
  quantity: number
  price: number
  image?: string
}

export interface ReturnRequest {
  id: string
  orderId: string
  createdAt: Date
  status: ReturnStatus
  reason: ReturnReason
  comment?: string
  items: ReturnItem[]
  refundAmount: number
  firstName: string
  lastName: string
  email: string
  phone: string
  resolution?: string
  resolvedAt?: Date
}

type ReturnsStore = {
  returns: ReturnRequest[]
  addReturn: (r: ReturnRequest) => Promise<{ ok: boolean; error?: string }>
  setReturnStatus: (id: string, status: ReturnStatus, resolution?: string) => void
  getReturn: (id: string) => ReturnRequest | undefined
  setReturns: (returns: ReturnRequest[]) => void
}

export const useReturnsStore = create<ReturnsStore>()((set, get) => ({
  returns: [],

  addReturn: async (r) => {
    const previous = get().returns
    set({ returns: [r, ...previous] })
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // id is generated server-side — do not send it
        body: JSON.stringify({
          orderId: r.orderId,
          reason: r.reason,
          comment: r.comment,
          items: r.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          firstName: r.firstName,
          lastName: r.lastName,
          phone: r.phone,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        set({ returns: previous })
        return { ok: false, error: body?.error }
      }
      // Swap the optimistic entry's temp id for the server-assigned one so
      // admin PATCHes and detail lookups hit the real record.
      const body = (await res.json().catch(() => null)) as { returnId?: string } | null
      if (body?.returnId) {
        set((state) => ({
          returns: state.returns.map((item) => (item.id === r.id ? { ...item, id: body.returnId! } : item)),
        }))
      }
      return { ok: true }
    } catch {
      set({ returns: previous })
      return { ok: false }
    }
  },

  setReturnStatus: (id, status, resolution) => {
    set((state) => ({
      returns: state.returns.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              ...(resolution !== undefined ? { resolution } : {}),
              ...(status !== 'pending' ? { resolvedAt: new Date() } : {}),
            }
          : r
      ),
    }))
    if (typeof window !== 'undefined') {
      const resolvedAt = status !== 'pending' ? new Date().toISOString() : null
      fetch(`/api/returns/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(resolution !== undefined ? { resolution } : {}), ...(resolvedAt ? { resolvedAt } : {}) }),
      }).catch(() => {})
    }
  },

  getReturn: (id) => get().returns.find((r) => r.id === id),

  setReturns: (returns) => set({ returns }),
}))

/** Raw shape returned by GET /api/returns and /api/returns/:id (dates as ISO strings). */
type ServerReturnRow = {
  id: string
  orderId: string
  createdAt: string
  status: string
  reason: string
  comment?: string | null
  items: unknown
  refundAmount: number
  firstName: string
  lastName: string
  email: string
  phone: string
  resolution?: string | null
  resolvedAt?: string | null
}

/**
 * Maps a DB row to the store's shape. The server only persists {productId, quantity}
 * per item (see /api/returns POST) — title/price/image are best-effort display fallbacks,
 * not authoritative order data.
 */
export function mapServerReturn(row: ServerReturnRow): ReturnRequest {
  const rawItems = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : []
  return {
    id: row.id,
    orderId: row.orderId,
    createdAt: new Date(row.createdAt),
    status: row.status as ReturnStatus,
    reason: row.reason as ReturnReason,
    comment: row.comment ?? undefined,
    items: rawItems.map((i) => ({
      productId: String(i.productId ?? ''),
      title: typeof i.title === 'string' ? i.title : String(i.productId ?? ''),
      quantity: typeof i.quantity === 'number' ? i.quantity : 0,
      price: typeof i.price === 'number' ? i.price : 0,
      image: typeof i.image === 'string' ? i.image : undefined,
    })),
    refundAmount: row.refundAmount,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    resolution: row.resolution ?? undefined,
    resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : undefined,
  }
}
