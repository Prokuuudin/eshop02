'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, ShoppingBag, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  useSubscriptionStore,
  SubscriptionInterval,
  SUBSCRIPTION_DISCOUNTS,
} from '@/lib/subscription-store'
import { getCurrentUser } from '@/lib/auth'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'
import { formatEuro } from '@/lib/utils'
import { Product } from '@/data/products'

interface SubscriptionWidgetProps {
  product: Product
  displayPrice: number
}

const INTERVALS: SubscriptionInterval[] = ['monthly', 'quarterly']

export const SubscriptionWidget: React.FC<SubscriptionWidgetProps> = ({ product, displayPrice }) => {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { subscribe, getActiveForProduct, cancel } = useSubscriptionStore()

  const [mode, setMode] = useState<'once' | 'subscribe'>('once')
  const [interval, setInterval] = useState<SubscriptionInterval>('monthly')
  const [quantity, setQuantity] = useState(1)
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [existingSub, setExistingSub] = useState<ReturnType<typeof getActiveForProduct>>(undefined)

  useEffect(() => {
    const user = getCurrentUser()
    if (!user) return
    setUserId(user.id)
    setExistingSub(getActiveForProduct(user.id, product.id))
  }, [product.id, getActiveForProduct])

  const discount = SUBSCRIPTION_DISCOUNTS[interval]
  const discountedPrice = useMemo(
    () => parseFloat((displayPrice * (1 - discount / 100)).toFixed(2)),
    [displayPrice, discount]
  )
  const savings = useMemo(
    () => parseFloat((displayPrice - discountedPrice).toFixed(2)),
    [displayPrice, discountedPrice]
  )

  const handleSubscribe = () => {
    if (!userId) {
      showToast(t('subscription.loginRequired'), 'error')
      return
    }
    const user = getCurrentUser()!
    const sub = subscribe({
      userId: user.id,
      userEmail: user.email,
      productId: product.id,
      productTitle: product.title,
      productImage: product.images?.[0] ?? product.image,
      pricePerUnit: displayPrice,
      quantity,
      interval,
    })
    setExistingSub(sub)
    setOpen(false)
    showToast(t('subscription.successToast'), 'success')
  }

  const handleCancel = () => {
    if (!existingSub) return
    cancel(existingSub.id)
    setExistingSub(undefined)
    showToast(t('subscription.cancelledToast'), 'info')
  }

  const nextDate = useMemo(() => {
    if (!existingSub) return null
    return new Date(existingSub.nextOrderDate).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }, [existingSub])

  if (product.stock === 0) return null

  if (existingSub) {
    return (
      <div className="subscription-widget subscription-widget--active mt-4 rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40 p-3">
        <div className="subscription-widget__header flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
              {t('subscription.activeTitle')}
            </span>
            <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-700 dark:border-primary dark:text-primary">
              -{existingSub.discountPercent}%
            </Badge>
          </div>
          <button
            onClick={handleCancel}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            {t('subscription.cancel')}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-indigo-700 dark:text-primary">
          {t(existingSub.interval === 'monthly' ? 'subscription.monthly' : 'subscription.quarterly')}
          {' · '}
          {existingSub.quantity} {t('product.pcs')}
          {' · '}
          {t('subscription.nextOn')} {nextDate}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="subscription-widget mt-4">
        <div className="subscription-widget__toggle flex rounded-lg border border-border overflow-hidden text-sm">
          <button
            className={`subscription-widget__tab flex-1 py-2 px-3 transition-colors font-medium ${
              mode === 'once'
                ? 'bg-card text-foreground'
                : 'bg-muted text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => setMode('once')}
          >
            <ShoppingBag className="w-3.5 h-3.5 inline mr-1.5 mb-0.5" />
            {t('subscription.modeOnce')}
          </button>
          <button
            className={`subscription-widget__tab flex-1 py-2 px-3 transition-colors font-medium border-l border-border ${
              mode === 'subscribe'
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => setMode('subscribe')}
          >
            <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 mb-0.5" />
            {t('subscription.modeSubscribe')}
          </button>
        </div>

        {mode === 'subscribe' && (
          <div className="subscription-widget__options mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="subscription-widget__intervals flex gap-2">
              {INTERVALS.map((iv) => {
                const disc = SUBSCRIPTION_DISCOUNTS[iv]
                const price = parseFloat((displayPrice * (1 - disc / 100)).toFixed(2))
                return (
                  <button
                    key={iv}
                    onClick={() => setInterval(iv)}
                    className={`subscription-widget__interval-btn flex-1 rounded-lg border p-2.5 text-left transition-all ${
                      interval === iv
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-500'
                        : 'border-border hover:border-indigo-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-foreground">
                      {t(`subscription.${iv}`)}
                    </div>
                    <div className="text-sm font-bold text-primary mt-0.5">
                      {formatEuro(price, 'en-US')}
                    </div>
                    <Badge className="mt-1 text-[10px] px-1.5 py-0 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-0">
                      -{disc}%
                    </Badge>
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              {t('subscription.savingsHint').replace('{amount}', formatEuro(savings, 'en-US'))}
            </p>

            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => {
                if (!userId) {
                  showToast(t('subscription.loginRequired'), 'error')
                  return
                }
                setOpen(true)
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('subscription.subscribeBtn')}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="subscription-widget__dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('subscription.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('subscription.confirmDesc')}</DialogDescription>
          </DialogHeader>

          <div className="subscription-widget__confirm space-y-4 mt-2">
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('subscription.product')}</span>
                <span className="font-medium text-right max-w-[60%]">{product.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('subscription.intervalLabel')}</span>
                <span className="font-medium">{t(`subscription.${interval}`)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('subscription.discount')}</span>
                <span className="font-medium text-green-600">-{discount}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">{t('subscription.quantity')}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                  >−</button>
                  <span className="w-6 text-center font-semibold">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                    className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                  >+</button>
                </div>
              </div>
              <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-2 mt-1">
                <span className="text-gray-700 dark:text-gray-200 font-medium">{t('subscription.totalPerOrder')}</span>
                <span className="font-bold text-primary">
                  {formatEuro(discountedPrice * quantity, 'en-US')}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('subscription.legalNote')}
            </p>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleSubscribe}>
                {t('subscription.confirmBtn')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
