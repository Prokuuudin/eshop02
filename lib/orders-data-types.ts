import type { ExtendedTransactionClient } from '@/lib/prisma'

export type ServerPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed'

export type ServerOrderItem = {
  id: string
  title: string
  brand: string
  image: string
  category: string
  price: number
  rating: number
  stock: number
  quantity: number
}

export type ServerOrderLegalDetails =
  | { customerType: 'individual'; personalCode: string }
  | {
      customerType: 'company'
      companyName: string
      regNumber: string
      vatNumber?: string
      legalAddress: string
      bankName: string
      iban: string
    }

export type ServerOrder = {
  id: string
  createdAt: string
  items: ServerOrderItem[]
  legalDetails?: ServerOrderLegalDetails
  subtotal: number
  tax: number
  delivery: number
  deliveryMethod: string
  /** Магазин самовывоза (id из data/stores.ts). В БД отдельной колонки нет:
   *  при pickup адрес магазина записывается в address/city (см. /api/orders POST). */
  pickupStoreId?: string
  paymentMethod: string
  promoCode?: string
  discount: number
  total: number
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  postalCode?: string
  bonusSpent?: number
  bonusEarned?: number
  paymentStatus?: ServerPaymentStatus
  paymentProvider?: 'manual'
  paymentSessionId?: string
  stockReservationStatus?: 'reserved' | 'committed' | 'released'
  stockReservedUntil?: string
  stockReleasedAt?: string
  language?: string
  userId?: string
  companyId?: string
  /** Server-scoped digest used to make checkout creation idempotent. */
  checkoutKey?: string
}

/** Thrown when one or more order items exceed the product's current stock. */
export class InsufficientStockError extends Error {
  readonly items: string[]

  constructor(items: string[]) {
    super(`Insufficient stock for: ${items.join(', ')}`)
    this.name = 'InsufficientStockError'
    this.items = items
  }
}

export class InsufficientBonusPointsError extends Error {
  constructor() {
    super('Insufficient bonus points')
    this.name = 'InsufficientBonusPointsError'
  }
}

export class PromoCodeUsageLimitError extends Error {
  constructor() {
    super('Promo code usage limit reached')
    this.name = 'PromoCodeUsageLimitError'
  }
}

export class ExistingCheckoutOrderError extends Error {
  constructor(readonly order: ServerOrder) {
    super('Checkout request was already completed')
    this.name = 'ExistingCheckoutOrderError'
  }
}

export class AdminOrderUpdateError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'paid_order' | 'released_stock' | 'invalid_item' | 'insufficient_stock'
  ) {
    super(message)
    this.name = 'AdminOrderUpdateError'
  }
}

export type AdminOrderUpdateInput = {
  items: Array<{ id: string; quantity: number; lineKey?: string; variantLabel?: string }>
  address: string
  city: string
  postalCode?: string
  deliveryMethod: 'courier' | 'pickup' | 'post' | 'venipak'
}

export type PrepareOrder = (
  tx: ExtendedTransactionClient,
  currentBonusBalance: number | null
) => Promise<Omit<ServerOrder, 'id'>>
