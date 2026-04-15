'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '@/lib/use-translation'
import Image from 'next/image'
import { useCart } from '@/lib/cart-store'
import { Checkbox } from '@/components/ui/checkbox'
import WholesaleMinimumAlert from '@/components/WholesaleMinimumAlert'
import CheckoutGuardButton from '@/components/CheckoutGuardButton'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import { useToast } from '@/lib/toast-context'
import {
  calculatePrice,
  getMinimumOrderQuantity,
  getWholesaleOrderGuard
} from '@/lib/customer-segmentation'

type CartDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { t, language } = useTranslation();
  const { showToast } = useToast()
  const { items, removeItem, updateQuantity, total } = useCart();
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([])
  const [selectionTouched, setSelectionTouched] = React.useState(false)
  const locale = getLocaleFromLanguage(language);
  const formatCurrency = (value: number): string => formatEuro(value, locale);
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setSelectedItemIds((prev) => {
      if (prev.length === 0 && !selectionTouched) {
        return items.map((item) => item.id)
      }

      const currentIds = new Set(items.map((item) => item.id))
      const next = prev.filter((id) => currentIds.has(id))

      if (next.length === 0 && items.length > 0 && !selectionTouched) {
        return items.map((item) => item.id)
      }

      return next
    })
  }, [items, selectionTouched])

  React.useEffect(() => {
    if (items.length === 0) {
      setSelectionTouched(false)
    }
  }, [items.length])

  const selectedItems = items.filter((item) => selectedItemIds.includes(item.id))
  const subtotal = selectedItems.reduce((sum, item) => sum + calculatePrice(item, item.quantity) * item.quantity, 0)
  const tax = Math.round(subtotal * 0.18)
  const delivery = subtotal > 0 ? 10 : 0 // фиксированная доставка в евро
  const finalTotal = subtotal + tax + delivery
  const wholesaleGuard = getWholesaleOrderGuard(subtotal)
  const selectedIdsParam = selectedItemIds.join(',')
  const checkoutHref = selectedItemIds.length > 0 ? `/checkout?items=${encodeURIComponent(selectedIdsParam)}` : '/checkout'

  const toggleSelected = (productId: string): void => {
    setSelectionTouched(true)
    setSelectedItemIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    )
  }

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleDecrease = (productId: string, quantity: number, minQuantity: number): void => {
    if (quantity <= minQuantity) {
      return;
    }
    updateQuantity(productId, quantity - 1);
  };

  if (!mounted) {
    return <></>
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        data-testid="cart-drawer-backdrop"
        className={`fixed inset-0 z-[10000] bg-black/50 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        data-testid="cart-drawer-panel"
        className={`cart-drawer fixed right-0 top-0 h-screen w-full max-w-md z-[10001] bg-white dark:bg-gray-900 shadow-lg flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ willChange: 'transform' }}
      >
        {/* Header */}
        <div className="cart-drawer__header border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between bg-white dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('cart.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
            aria-label={t('cart.closeAria')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Items scroll area */}
        <div className="cart-drawer__items flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-gray-900">
          {items.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-3 rounded border border-gray-200 dark:border-gray-700 p-2 text-xs">
              <span className="text-gray-700 dark:text-gray-300">
                {t('cart.selectedForCheckout')}: <span className="font-semibold">{selectedItemIds.length}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectionTouched(true)
                  setSelectedItemIds(items.map((item) => item.id))
                }}
                className="text-indigo-600 hover:underline"
              >
                {t('cart.selectAll')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectionTouched(true)
                  setSelectedItemIds([])
                }}
                className="text-indigo-600 hover:underline"
              >
                {t('cart.unselectAll')}
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('cart.empty')}</p>
          ) : (
            items.map((item) => {
              const minQuantity = getMinimumOrderQuantity(item)
              const localizedTitle = t(`products.${item.id}.title`, item.title)
              const isSelected = selectedItemIds.includes(item.id)
              return (
                <div key={item.id} className="cart-drawer__item flex gap-3 border-b border-gray-200 dark:border-gray-700 pb-4">
                  <div className="pt-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(item.id)}
                      aria-label={`${t('cart.selectForCheckout')}: ${localizedTitle}`}
                    />
                  </div>
                  <Image
                    src={item.image}
                    alt={localizedTitle || t('cart.imageAlt')}
                    width={80}
                    height={80}
                    className="w-20 h-20 object-cover rounded"
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium line-clamp-2 text-gray-900 dark:text-gray-100">{localizedTitle}</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{item.brand}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDecrease(item.id, item.quantity, minQuantity)}
                          className="w-6 h-6 flex items-center justify-center border rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm text-gray-900 dark:text-gray-100">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-6 h-6 flex items-center justify-center border rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                        >
                          +
                        </button>
                      </div>
                      <ConfirmActionDialog
                        title={t('confirm.title')}
                        description={t('confirm.removeCartItem')}
                        confirmLabel={t('cart.remove')}
                        cancelLabel={t('common.cancel')}
                        onConfirm={() => {
                          removeItem(item.id)
                          showToast(t('toast.removedFromCart'), 'info')
                        }}
                        trigger={
                          <button className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium">
                            {t('cart.remove')}
                          </button>
                        }
                      />
                    </div>
                    {minQuantity > 1 && (
                      <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">{t('common.min')} {minQuantity} {t('product.pcs')}</p>
                    )}
                    <p className="text-sm font-semibold mt-2 text-gray-900 dark:text-gray-100">{formatCurrency(calculatePrice(item, item.quantity) * item.quantity)}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer with summary */}
        {items.length > 0 && (
          <div className="cart-drawer__footer border-t border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-white dark:bg-gray-900">
            {!wholesaleGuard.isMinimumReached && selectedItemIds.length > 0 && (
              <WholesaleMinimumAlert
                minOrderAmount={wholesaleGuard.minOrderAmount}
                shortage={wholesaleGuard.shortage}
                formatCurrency={formatCurrency}
              />
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600 dark:text-gray-300">
                <span>{t('cart.subtotal')}</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-300">
                <span>{t('cart.tax')}</span>
                <span>{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-300">
                <span>{t('cart.shipping')}</span>
                <span>{formatCurrency(delivery)}</span>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between font-semibold text-base text-gray-900 dark:text-gray-100">
              <span>{t('cart.total')}</span>
              <span>{formatCurrency(finalTotal)}</span>
            </div>
            {selectedItemIds.length === 0 && (
              <p className="text-xs text-red-600">{t('cart.selectAtLeastOne')}</p>
            )}
            <CheckoutGuardButton
              canCheckout={wholesaleGuard.isMinimumReached && selectedItemIds.length > 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              label={t('cart.checkout')}
              href={checkoutHref}
              onNavigate={onClose}
            />
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
