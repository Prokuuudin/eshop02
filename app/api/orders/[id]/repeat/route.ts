import { NextRequest, NextResponse } from 'next/server'
import { canAccessOrder, getServerOrderById } from '@/lib/orders-data-store'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { toNum } from '@/lib/decimal'
import { buildLineKey, type CartItem, type SelectedVariant } from '@/lib/cart-store'
import { sumPriceAdjustment } from '@/lib/product-variants'
import { calculatePrice } from '@/lib/customer-segmentation'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

type SnapshotItem = Partial<CartItem> & {
  id?: unknown
  quantity?: unknown
  selectedVariants?: SelectedVariant[]
}

function jsonObject(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, number>
}

function bulkTiers(value: unknown): Array<{ quantity: number; pricePerUnit: number }> | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.flatMap((tier) => {
    if (!tier || typeof tier !== 'object') return []
    const quantity = Number((tier as { quantity?: unknown }).quantity)
    const pricePerUnit = Number((tier as { pricePerUnit?: unknown }).pricePerUnit)
    return Number.isFinite(quantity) && Number.isFinite(pricePerUnit) ? [{ quantity, pricePerUnit }] : []
  })
  return result.length ? result : undefined
}

export async function POST(_request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const caller = await getServerUser()
    if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await context.params
    const order = await getServerOrderById(id)
    if (!order || !canAccessOrder(order, caller)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const snapshots = Array.isArray(order.items) ? order.items as SnapshotItem[] : []
    const ids = [...new Set(snapshots.map((item) => typeof item.id === 'string' ? item.id : '').filter(Boolean))]
    const products = await prisma.product.findMany({
      where: { id: { in: ids }, isDeleted: false, isActive: true },
      select: {
        id: true, title: true, titleKey: true, titleEn: true, titleLv: true,
        brand: true, image: true, images: true, price: true, stock: true,
        bonusRate: true, bulkPricingTiers: true, minOrderQuantities: true,
        category: true, sku: true,
      },
    })
    const byId = new Map(products.map((product) => [product.id, product]))
    const items: CartItem[] = []
    const changes: Array<{ id: string; title: string; type: 'price_changed' | 'quantity_changed'; oldValue: number; newValue: number }> = []
    const unavailableItems: Array<{ id: string; title: string }> = []

    for (const snapshot of snapshots) {
      if (typeof snapshot.id !== 'string') continue
      const product = byId.get(snapshot.id)
      const oldTitle = typeof snapshot.title === 'string' ? snapshot.title : snapshot.id
      if (!product || product.stock <= 0) {
        unavailableItems.push({ id: snapshot.id, title: oldTitle })
        continue
      }

      const requestedQuantity = Math.max(1, Math.floor(Number(snapshot.quantity) || 1))
      const quantity = Math.min(requestedQuantity, product.stock)
      const selectedVariants = Array.isArray(snapshot.selectedVariants) ? snapshot.selectedVariants : undefined
      const price = toNum(product.price) + sumPriceAdjustment(selectedVariants ?? [])
      const currentBulkTiers = bulkTiers(product.bulkPricingTiers)
      const effectivePrice = calculatePrice({ price, bulkPricingTiers: currentBulkTiers }, quantity)
      const oldPrice = Number(snapshot.price)
      if (Number.isFinite(oldPrice) && Math.abs(oldPrice - effectivePrice) >= 0.005) {
        changes.push({ id: product.id, title: product.title, type: 'price_changed', oldValue: oldPrice, newValue: effectivePrice })
      }
      if (quantity !== requestedQuantity) {
        changes.push({ id: product.id, title: product.title, type: 'quantity_changed', oldValue: requestedQuantity, newValue: quantity })
      }

      items.push({
        id: product.id,
        lineKey: buildLineKey(product.id, selectedVariants),
        selectedVariants,
        variantLabel: snapshot.variantLabel,
        titleKey: product.titleKey ?? undefined,
        title: product.title,
        titleEn: product.titleEn ?? undefined,
        titleLv: product.titleLv ?? undefined,
        brand: product.brand,
        image: product.image ?? product.images[0],
        price,
        quantity,
        bonusRate: product.bonusRate ?? undefined,
        bulkPricingTiers: currentBulkTiers,
        minOrderQuantities: jsonObject(product.minOrderQuantities),
        category: product.category,
        sku: product.sku ?? undefined,
      })
    }

    return NextResponse.json({ items, changes, unavailableItems })
  } catch (error) {
    logApiError('[orders repeat POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
