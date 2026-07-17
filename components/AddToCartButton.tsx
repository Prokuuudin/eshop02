'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/use-translation'
import { Product, SelectedVariant } from '@/data/products'
import { Button } from './ui/button'
import { useCart } from '@/lib/cart-store'
import { useToast } from '@/lib/toast-context'
import { useAuthStore } from '@/lib/auth-store'
import { getMinimumOrderQuantity, calculatePrice } from '@/lib/customer-segmentation'
import { formatEuro } from '@/lib/utils'
import { getVariantGroups, getMissingRequiredGroups } from '@/lib/product-variants'
import AuthGateDialog from '@/components/AuthGateDialog'

type Props = {
  product: Product
  /**
   * undefined = в этом контексте нет селектора вариантов (карточка каталога).
   * массив (возможно пустой) = селектор есть (страница товара), это его текущее значение.
   */
  selectedVariants?: SelectedVariant[]
  /** Родитель хочет знать выбранное количество (бонус-блок на странице товара). */
  onQuantityChange?: (quantity: number) => void
}

export default function AddToCartButton({ product, selectedVariants, onQuantityChange }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const minOrderQuantity = useMemo(() => getMinimumOrderQuantity(product), [product])
  const [quantity, setQuantity] = useState(minOrderQuantity)
  const { addItem } = useCart()
  const hasVariantSelector = selectedVariants !== undefined
  const variantGroups = useMemo(() => getVariantGroups(product), [product])
  const missingRequired = useMemo(
    () => getMissingRequiredGroups(variantGroups, selectedVariants ?? []),
    [variantGroups, selectedVariants]
  )
  const needsVariantSelectionElsewhere = !hasVariantSelector && (variantGroups ?? []).some((g) => g.required)
  const [added, setAdded] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const isOutOfStock = product.stock === 0
  const maxQuantity = product.stock

  const [tierFlash, setTierFlash] = useState(false)
  const prevTierRef = useRef<number | null>(null)

  const sortedTiers = useMemo(
    () => (product.bulkPricingTiers ?? []).slice().sort((a, b) => a.quantity - b.quantity),
    [product.bulkPricingTiers]
  )

  const nextTier = sortedTiers.find(tier => tier.quantity > quantity) ?? null
  const activeTier = sortedTiers.filter(tier => tier.quantity <= quantity).pop() ?? null
  const progressPct = nextTier
    ? Math.min(100, Math.round((quantity / nextTier.quantity) * 100))
    : 100

  useEffect(() => {
    const currentTierQty = activeTier?.quantity ?? null
    if (currentTierQty !== null && currentTierQty !== prevTierRef.current) {
      setTierFlash(true)
      const timer = setTimeout(() => setTierFlash(false), 1000)
      prevTierRef.current = currentTierQty
      return () => clearTimeout(timer)
    }
    prevTierRef.current = currentTierQty
  }, [activeTier?.quantity])

  useEffect(() => {
    setQuantity((prev) => Math.max(prev, minOrderQuantity))
  }, [minOrderQuantity])

  useEffect(() => {
    onQuantityChange?.(quantity)
  }, [quantity, onQuantityChange])

  const handleAdd = (): void => {
    if (!isAuthenticated) {
      setAuthGateOpen(true)
      return
    }

    if (isOutOfStock) {
      showToast(t('toast.errorOutOfStock'), 'error')
      return
    }

    if (quantity < minOrderQuantity) {
      showToast(`${t('product.minimumOrder')}: ${minOrderQuantity} ${t('product.pieces')}`, 'error')
      return
    }

    if (missingRequired.length > 0) {
      showToast(`${t('product.selectVariantRequired')}: ${missingRequired.map((g) => g.name).join(', ')}`, 'error')
      return
    }

    addItem(product, quantity, selectedVariants)
    showToast(t('toast.addedToCart'), 'success')
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      document.dispatchEvent(
        new CustomEvent('fly-to-cart', {
          detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        })
      )
    }
  }

  if (needsVariantSelectionElsewhere) {
    return (
      <Button asChild className="w-full add-to-cart__button">
        <Link href={`/product/${product.id}`}>{t('product.selectVariant')}</Link>
      </Button>
    )
  }

  return (
    <div className="add-to-cart space-y-3 w-full">
      {isOutOfStock && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
          <p className="text-red-600 text-sm font-medium">{t('product.outOfStock')}</p>
        </div>
      )}

      {/* Прогресс к оптовой цене показывает цены — гостям, как и остальные цены, не виден. */}
      {isAuthenticated && sortedTiers.length > 0 && !isOutOfStock && (
        <div className="add-to-cart__bulk-progress w-full">
          {nextTier ? (
            <>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>
                  {t('product.bulkProgressLabel', undefined, {
                    remaining: String(nextTier.quantity - quantity),
                    price: formatEuro(calculatePrice(product, nextTier.quantity), 'en-US'),
                  })}
                </span>
                <span className="font-mono">{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          ) : (
            <p className={`text-xs font-medium text-center py-1 rounded transition-colors duration-500 ${
              tierFlash ? 'text-white bg-green-500' : 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30'
            }`}>
              {t('product.bulkProgressUnlocked')}
            </p>
          )}
        </div>
      )}

      {minOrderQuantity > 1 && !isOutOfStock && (
        <p className="text-xs text-gray-500">{t('product.minimumOrder')}: {minOrderQuantity} {t('product.pieces')}</p>
      )}

      {/* Единый контрол: − и + по краям меняют количество, центр добавляет в
          корзину; выбранное число — в скобках в подписи. Вложенные кнопки в
          <button> невалидны, поэтому контейнер — div, стилизованный под кнопку. */}
      <div
        className={`add-to-cart__combo flex items-stretch w-full h-9 rounded-md overflow-hidden text-white text-sm font-medium shadow divide-x divide-white/20 transition-colors ${
          added ? 'bg-green-600' : 'bg-indigo-600'
        } ${isOutOfStock ? 'opacity-50' : ''}`}
      >
        <button
          type="button"
          onClick={() => setQuantity(Math.max(minOrderQuantity, quantity - 1))}
          disabled={isOutOfStock || quantity <= minOrderQuantity}
          className="add-to-cart__minus w-9 shrink-0 flex items-center justify-center text-lg hover:bg-black/15 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
          tabIndex={-1}
          aria-label={t('product.decreaseQuantityAria')}
        >
          −
        </button>
        <button
          ref={buttonRef}
          type="button"
          onClick={handleAdd}
          disabled={isOutOfStock || !isHydrated || missingRequired.length > 0}
          className="add-to-cart__button flex-1 min-w-0 px-1 flex items-center justify-center hover:bg-black/10 disabled:cursor-not-allowed transition-colors"
        >
          <span className="truncate">
            {added ? `✓ ${t('product.addedToCart')}` : `${t('product.addToCart')} (${quantity})`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
          disabled={isOutOfStock || quantity >= maxQuantity}
          className="add-to-cart__plus w-9 shrink-0 flex items-center justify-center text-lg hover:bg-black/15 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
          tabIndex={-1}
          aria-label={t('product.increaseQuantityAria')}
        >
          +
        </button>
      </div>
      <AuthGateDialog open={authGateOpen} onOpenChange={setAuthGateOpen} />
    </div>
  )
}
