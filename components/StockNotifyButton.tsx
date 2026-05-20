'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useStockNotifyStore } from '@/lib/stock-notify-store'
import { getCurrentUser } from '@/lib/auth'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'

interface StockNotifyButtonProps {
  productId: string
  productTitle: string
  compact?: boolean
}

export const StockNotifyButton: React.FC<StockNotifyButtonProps> = ({ productId, productTitle, compact = false }) => {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const subscriptions = useStockNotifyStore((state) => state.subscriptions)
  const { subscribe, unsubscribe } = useStockNotifyStore()

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const user = getCurrentUser()
    if (user?.email) setEmail(user.email)
  }, [])

  const activeSub = useMemo(
    () => subscriptions.find((s) => s.productId === productId && !s.notified && s.email === email),
    [subscriptions, productId, email]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t('stockNotify.emailError'))
      return
    }
    const user = getCurrentUser()
    const result = subscribe(productId, productTitle, trimmed, user?.id)
    if (result === 'already') {
      showToast(t('stockNotify.alreadySubscribed'), 'info')
    } else {
      showToast(t('stockNotify.successMessage'), 'success')
    }
    setOpen(false)
  }

  const handleUnsubscribe = () => {
    if (!activeSub) return
    unsubscribe(activeSub.id)
    showToast(t('stockNotify.unsubscribed'), 'info')
  }

  if (activeSub) {
    return (
      <div className={`stock-notify stock-notify--active flex items-center justify-between gap-2 rounded-md px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 ${compact ? 'mt-1' : 'mt-3'}`}>
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 overflow-hidden">
          <BellOff className="w-3.5 h-3.5 shrink-0" />
          <span className={`truncate ${compact ? 'text-xs' : 'text-sm'}`}>
            {t('stockNotify.subscribedLabel')}
          </span>
        </div>
        <button
          onClick={handleUnsubscribe}
          className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
          title={t('stockNotify.unsubscribe')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={compact ? 'sm' : 'default'}
          className={`stock-notify__trigger w-full gap-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950 ${compact ? '' : 'mt-3'}`}
        >
          <Bell className="w-4 h-4" />
          {t('stockNotify.button')}
        </Button>
      </DialogTrigger>

      <DialogContent className="stock-notify__dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('stockNotify.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('stockNotify.dialogDesc')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="stock-notify__form space-y-4 mt-2">
          <div className="stock-notify__field space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('stockNotify.emailLabel')}
            </label>
            <Input
              type="email"
              placeholder={t('stockNotify.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={error ? 'border-red-400' : ''}
              autoFocus
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
            <Bell className="w-4 h-4 mr-2" />
            {t('stockNotify.submit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
