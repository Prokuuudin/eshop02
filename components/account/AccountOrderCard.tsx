'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatDate, formatEuro } from '@/lib/utils'
import type { Order } from '@/lib/orders-store'

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
  detailsLabel,
  onRepeatOrder
}: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex-1">
          <p className="font-mono text-sm text-gray-600 dark:text-gray-300">{order.id}</p>
          <div className={`mt-1 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusClasses}`}>
            {statusLabel}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            📅 {formatDate(order.createdAt, locale)}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            📦 {order.items.length} {itemsUnit} • {deliveryLabel}
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold text-indigo-600">{formatEuro(order.total, locale)}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">
            {order.promoCode && `${promoCodeLabel}: ${order.promoCode}`}
          </p>
          {(order.bonusSpent ?? 0) > 0 && (
            <p className="mt-1 text-xs text-green-700">
              {bonusSpentLabel}: -{order.bonusSpent ?? 0}
            </p>
          )}
          {(order.bonusEarned ?? 0) > 0 && (
            <p className="mt-1 text-xs text-indigo-700">
              {bonusEarnedLabel}: +{order.bonusEarned ?? 0}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRepeatOrder}>
            {repeatOrderLabel}
          </Button>
          <Link href={`/order/${order.id}`}>
            <Button variant="outline" size="sm">
              {detailsLabel}
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-gray-200 pt-3 dark:border-gray-700">
        {order.items.map((item) => (
          <p key={item.id} className="text-xs text-gray-600 dark:text-gray-300">
            {item.title} × {item.quantity}
          </p>
        ))}
      </div>
    </div>
  )
}