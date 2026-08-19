'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useProductNewsStore } from '@/lib/product-news-store'
import { getCurrentUser } from '@/lib/auth'
import { useAuthStore } from '@/lib/auth-store'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'
import { Product } from '@/data/products'

interface ProductNewsWidgetProps {
  product: Product
}

export const ProductNewsWidget: React.FC<ProductNewsWidgetProps> = ({ product }) => {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { subscribe, update, unsubscribe, getForProduct } = useProductNewsStore()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isHydrated = useAuthStore((s) => s.isHydrated)

  const [open, setOpen] = useState(false)
  const [notifyPrice, setNotifyPrice] = useState(true)
  const [notifyStock, setNotifyStock] = useState(true)
  const [notifyPromo, setNotifyPromo] = useState(true)
  const [existingSub, setExistingSub] = useState<ReturnType<typeof getForProduct>>(undefined)
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('subscribe') !== '1') return
    if (!isHydrated || !isAuthenticated) return
    queueMicrotask(() => {
      setOpen(true)
      widgetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [isHydrated, isAuthenticated])

  useEffect(() => {
    const user = getCurrentUser()
    if (!user) return
    queueMicrotask(() => setExistingSub(getForProduct(product.id)))
  }, [product.id, getForProduct])

  const openDialog = (): void => {
    if (existingSub) {
      setNotifyPrice(existingSub.notifyPrice)
      setNotifyStock(existingSub.notifyStock)
      setNotifyPromo(existingSub.notifyPromo)
    } else {
      setNotifyPrice(true)
      setNotifyStock(true)
      setNotifyPromo(true)
    }
    setOpen(true)
  }

  const handleConfirm = async (): Promise<void> => {
    if (!notifyPrice && !notifyStock && !notifyPromo) {
      showToast(t('productNews.selectAtLeastOne'), 'error')
      return
    }
    if (existingSub) {
      update(existingSub.id, { notifyPrice, notifyStock, notifyPromo })
      setExistingSub({ ...existingSub, notifyPrice, notifyStock, notifyPromo })
      setOpen(false)
      showToast(t('productNews.updatedToast'), 'success')
      return
    }
    const user = getCurrentUser()
    if (!user) {
      showToast(t('productNews.loginRequired'), 'error')
      return
    }
    const sub = await subscribe({
      productId: product.id,
      productTitle: product.title,
      notifyPrice,
      notifyStock,
      notifyPromo,
    })
    if (!sub) {
      showToast(t('productNews.selectAtLeastOne'), 'error')
      return
    }
    setExistingSub(sub)
    setOpen(false)
    showToast(t('productNews.successToast'), 'success')
  }

  const handleUnsubscribe = (): void => {
    if (!existingSub) return
    unsubscribe(existingSub.id)
    setExistingSub(undefined)
    showToast(t('productNews.unsubscribedToast'), 'info')
  }

  const activeTypesLabel = useMemo(() => {
    if (!existingSub) return ''
    const parts: string[] = []
    if (existingSub.notifyPrice) parts.push(t('productNews.typePrice'))
    if (existingSub.notifyStock) parts.push(t('productNews.typeStock'))
    if (existingSub.notifyPromo) parts.push(t('productNews.typePromo'))
    return parts.join(', ')
  }, [existingSub, t])

  if (!isHydrated || !isAuthenticated) return null

  return (
    <>
      <div ref={widgetRef} id="product-subscription" className="product-news-widget mt-4 scroll-mt-24">
        {existingSub ? (
          <div className="product-news-widget__active flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 dark:border-primary/40 dark:bg-primary/20 p-3">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary dark:text-primary/60">
                  {t('productNews.activeLabel')}
                </p>
                <p className="text-xs text-muted-foreground truncate">{activeTypesLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={openDialog} className="text-xs text-primary hover:underline">
                {t('productNews.editBtn')}
              </button>
              <button onClick={handleUnsubscribe} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                {t('productNews.unsubscribeBtn')}
              </button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="product-news-widget__trigger w-full gap-2 border-primary/50 text-primary hover:bg-primary/5 dark:border-primary/50 dark:text-primary dark:hover:bg-primary/20"
            onClick={openDialog}
          >
            <Bell className="w-4 h-4" />
            {t('productNews.notifyBtn')}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="product-news-widget__dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('productNews.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('productNews.dialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="product-news-widget__options space-y-3 mt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={notifyPrice} onCheckedChange={(v) => setNotifyPrice(v === true)} />
              {t('productNews.typePrice')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={notifyStock} onCheckedChange={(v) => setNotifyStock(v === true)} />
              {t('productNews.typeStock')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={notifyPromo} onCheckedChange={(v) => setNotifyPromo(v === true)} />
              {t('productNews.typePromo')}
            </label>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => void handleConfirm()}>
                {existingSub ? t('productNews.saveBtn') : t('productNews.subscribeBtn')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
