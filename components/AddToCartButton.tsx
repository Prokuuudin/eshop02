'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { Product } from '@/data/products'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { useCart } from '@/lib/cart-store'
import { useToast } from '@/lib/toast-context'
import { getMinimumOrderQuantity } from '@/lib/customer-segmentation'

type Props = {
  product: Product
}

export default function AddToCartButton({ product }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast()
  const minOrderQuantity = useMemo(() => getMinimumOrderQuantity(product), [product])
  const [quantity, setQuantity] = useState(minOrderQuantity)
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  const isOutOfStock = product.stock === 0
  const maxQuantity = product.stock

  useEffect(() => {
    setQuantity((prev) => Math.max(prev, minOrderQuantity))
  }, [minOrderQuantity])

  const handleAdd = (): void => {
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
              <div className="flex items-center border border-gray-300 dark:border-gray-700 rounded-full bg-white dark:bg-gray-800 px-1 py-0.5 shadow-sm w-auto">
                <button
                  onClick={() => setQuantity(Math.max(minOrderQuantity, quantity - 1))}
                  className="w-7 h-7 flex items-center justify-center text-lg text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition disabled:opacity-50"
                  disabled={isOutOfStock}
                  tabIndex={-1}
                  aria-label="Уменьшить количество"
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
                  aria-label="Увеличить количество"
                >
                  +
                </button>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">{t('product.changeQuantity')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {minOrderQuantity > 1 && !isOutOfStock && (
        <p className="text-xs text-gray-500">{t('product.minimumOrder')}: {minOrderQuantity} {t('product.pieces')}</p>
      )}

      <Button
        onClick={handleAdd}
        disabled={isOutOfStock}
        className={`w-full add-to-cart__button ${
          added ? 'bg-green-600 hover:bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
        } ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {added ? `✓ ${t('product.addedToCart')}` : t('product.addToCart')}
      </Button>
    </div>
  )
}
