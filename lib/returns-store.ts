import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

const DEMO_RETURNS: ReturnRequest[] = [
  {
    id: 'RET-001-DEMO',
    orderId: 'ORD-1778951045449-KH6Q8U4GA',
    createdAt: new Date('2026-05-18T10:22:00.000Z'),
    status: 'pending',
    reason: 'damaged',
    comment: 'Фен пришёл с трещиной на корпусе, упаковка была вскрыта',
    items: [{ productId: 'p8', title: 'Профессиональный фен SalonDry 2200W', quantity: 1, price: 7200, image: '/products/p8.jpg' }],
    refundAmount: 7200,
    firstName: 'Aleksandrs',
    lastName: 'Prokudins',
    email: 'prokuuudin@gmail.com',
    phone: '29711575',
  },
  {
    id: 'RET-002-DEMO',
    orderId: 'ORD-1778839321340-HKFPNLBT7',
    createdAt: new Date('2026-05-17T14:05:00.000Z'),
    status: 'approved',
    reason: 'wrong_item',
    comment: 'Заказывал шампунь 500ml, прислали 300ml',
    items: [{ productId: 'p2', title: 'Шампунь Professional Shine 300ml', quantity: 3, price: 1200, image: '/products/p2.jpg' }],
    refundAmount: 3600,
    firstName: 'Aleksandrs',
    lastName: 'Prokudins',
    email: 'prokuuudin@gmail.com',
    phone: '29711575',
    resolution: 'Подтверждено — отправлен неверный артикул. Одобрен полный возврат.',
    resolvedAt: new Date('2026-05-17T16:30:00.000Z'),
  },
  {
    id: 'RET-003-DEMO',
    orderId: 'ORD-1778757870292-YABL7QJO4',
    createdAt: new Date('2026-05-16T09:44:00.000Z'),
    status: 'refunded',
    reason: 'changed_mind',
    items: [
      { productId: 'p1', title: 'Крем для лица Revitaluxe 50ml', quantity: 1, price: 2500, image: '/products/p1.jpg' },
      { productId: 'p5', title: 'Крем для тела SilkTouch 200ml', quantity: 1, price: 1500, image: '/products/p5.jpg' },
    ],
    refundAmount: 4000,
    firstName: 'Aleksandrs',
    lastName: 'Prokudins',
    email: 'prokuuudin@gmail.com',
    phone: '29711575',
    resolution: 'Товар получен в нераспечатанном виде. Возврат средств выполнен.',
    resolvedAt: new Date('2026-05-17T11:00:00.000Z'),
  },
]

type ReturnsStore = {
  returns: ReturnRequest[]
  addReturn: (r: ReturnRequest) => void
  setReturnStatus: (id: string, status: ReturnStatus, resolution?: string) => void
  getReturn: (id: string) => ReturnRequest | undefined
}

export const useReturnsStore = create<ReturnsStore>()(
  persist(
    (set, get) => ({
      returns: DEMO_RETURNS,

      addReturn: (r) =>
        set((state) => ({ returns: [r, ...state.returns] })),

      setReturnStatus: (id, status, resolution) =>
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
        })),

      getReturn: (id) => get().returns.find((r) => r.id === id),
    }),
    { name: 'returns-store' }
  )
)
