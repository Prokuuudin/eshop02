'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { Product } from '@/data/products'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { useCart } from '@/lib/cart-store'
import { useToast } from '@/lib/toast-context'
import { useAuthStore } from '@/lib/auth-store'
import { getMinimumOrderQuantity, calculatePrice } from '@/lib/customer-segmentation'
import { formatEuro } from '@/lib/utils'
import AuthGateDialog from '@/components/AuthGateDialog'

type Props = {
  product: Product
}

export default function AddToCartButton({ product }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const [authGateOpen, setAuthGateOpen] = useState(false)
  const minOrderQuantity = useMemo(() => getMinimumOrderQuantity(product), [product])
  const [quantity, setQuantity] = useState(minOrderQuantity)
  const { addItem } = useCart()
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

    addItem(product, quantity)
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

  return (
    <div className="add-to-cart space-y-3 w-full">
      {isOutOfStock && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
          <p className="text-red-600 text-sm font-medium">{t('product.outOfStock')}</p>
        </div>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="add-to-cart__quantity flex justify-center items-center gap-2 w-full min-w-0">
              <div className="flex items-center border border-border rounded-full bg-card px-1 py-0.5 shadow-sm w-auto">
                <button
                  onClick={() => setQuantity(Math.max(minOrderQuantity, quantity - 1))}
                  className="w-7 h-7 flex items-center justify-center text-lg text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition disabled:opacity-50"
                  disabled={isOutOfStock}
                  tabIndex={-1}
                  aria-label={t('product.decreaseQuantityAria')}
                >
                  −
                </button>
                <input
                  id="qty"
                  type="number"
                  min={minOrderQuantity}
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(minOrderQuantity, Math.min(maxQuantity, parseInt(e.target.value) || minOrderQuantity)))}
                  className="w-10 h-7 mx-1 text-center bg-transparent text-base font-semibold outline-none border-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  disabled={isOutOfStock}
                />
                <button
                  onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                  className="w-7 h-7 flex items-center justify-center text-lg text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition disabled:opacity-50"
                  disabled={isOutOfStock || quantity >= maxQuantity}
                  tabIndex={-1}
                  aria-label={t('product.increaseQuantityAria')}
                >
                  +
                </button>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">{t('product.changeQuantity')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {sortedTiers.length > 0 && !isOutOfStock && (
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

      <Button
        ref={buttonRef}
        onClick={handleAdd}
        disabled={isOutOfStock || !isHydrated}
        className={`w-full add-to-cart__button ${
          added ? 'bg-green-600 hover:bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
        } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {added ? `✓ ${t('product.addedToCart')}` : t('product.addToCart')}
      </Button>
      <AuthGateDialog open={authGateOpen} onOpenChange={setAuthGateOpen} />
    </div>
  )
}
