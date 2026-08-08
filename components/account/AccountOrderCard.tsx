'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, BookmarkPlus, CalendarDays, Coins, Package, RotateCcw, Truck } from 'lucide-react'
import { formatDate, formatEuro } from '@/lib/utils'
import { pointsToEuros } from '@/lib/bonus-program'
import type { Order } from '@/lib/orders-store'
import { SaveAsTemplateDialog } from '@/components/SaveAsTemplateDialog'

type Props = {
  order: Order
  statusLabel: string
  statusClasses: string
  locale: string
  itemsUnit: string
  deliveryLabel: string
  promoCodeLabel: string
  bonusSpentLabel: string
  bonusEarnedLabel: string
  repeatOrderLabel: string
  saveAsTemplateLabel: string
  detailsLabel: string
  onRepeatOrder: () => void
}

export default function AccountOrderCard({
  order,
  statusLabel,
  statusClasses,
  locale,
  itemsUnit,
  deliveryLabel,
  promoCodeLabel,
  bonusSpentLabel,
  bonusEarnedLabel,
  repeatOrderLabel,
  saveAsTemplateLabel,
  detailsLabel,
  onRepeatOrder,
}: Props): React.ReactElement {
  const [templateOpen, setTemplateOpen] = useState(false)
  const defaultName = formatDate(order.createdAt, locale)

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-base font-bold text-foreground">№ {order.id}</p>
            <div className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses}`}>
              {statusLabel}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDate(order.createdAt, locale)}</span>
            <span className="inline-flex items-center gap-1.5"><Truck className="h-4 w-4" />{deliveryLabel}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xl font-bold tracking-tight text-primary">{formatEuro(order.total, locale)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {order.promoCode && `${promoCodeLabel}: ${order.promoCode}`}
          </p>
          {(order.bonusSpent ?? 0) > 0 && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              {bonusSpentLabel}: -{order.bonusSpent ?? 0}
              {' '}(= −{formatEuro(pointsToEuros(order.bonusSpent ?? 0), locale)})
            </p>
          )}
          {(order.bonusEarned ?? 0) > 0 && (
            <p className="mt-1 inline-flex items-center justify-end gap-1 text-xs font-medium text-primary">
              <Coins className="h-3.5 w-3.5" />
              {bonusEarnedLabel}: +{order.bonusEarned ?? 0}
              {' '}(= {formatEuro(pointsToEuros(order.bonusEarned ?? 0), locale)})
            </p>
          )}
        </div>
      </div>

      <SaveAsTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        items={order.items}
        defaultName={defaultName}
      />

      <div className="border-y border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/30 sm:px-5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          {order.items.length} {itemsUnit}
        </div>
        <div className="space-y-1.5">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
            <p className="min-w-0 text-foreground">{item.title}</p>
            <span className="shrink-0 font-medium text-muted-foreground">× {item.quantity}</span>
          </div>
        ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:px-5">
        <Button className="gap-2 sm:w-auto" size="sm" onClick={onRepeatOrder}>
          <RotateCcw className="h-3.5 w-3.5" />{repeatOrderLabel}
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 sm:w-auto" onClick={() => setTemplateOpen(true)}>
          <BookmarkPlus className="h-3.5 w-3.5" />{saveAsTemplateLabel}
        </Button>
        <Link href={`/order/${order.id}`} className="sm:ml-auto">
          <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground sm:w-auto">
            {detailsLabel}<ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </article>
  )
}
