'use client'

import { useState } from 'react'
import type { OrderStatus } from '@/lib/admin-store'
import { useAdminLocale } from '@/lib/use-admin-locale'
import { useToast } from '@/lib/toast-context'
import type { useAdminOrdersPage } from './useAdminOrdersPage'

type OrdersState = ReturnType<typeof useAdminOrdersPage>
type Order = OrdersState['pageItems'][number]

export function OrderQuickActions({ order, state, status }: {
  order: Order
  state: OrdersState
  status: OrderStatus
}): React.ReactElement {
  const { l } = useAdminLocale()
  const { showToast } = useToast()
  const { editingOrderId, cancelEdit, startEdit, setInvoiceOrder } = state
  const canEdit = !['shipped', 'delivered', 'cancelled'].includes(status)
  const [copied, setCopied] = useState(false)

  const handleCopyId = () => {
    if (!navigator.clipboard) {
      showToast(l('Копирование недоступно в этом окружении', 'Copying unavailable in this environment', 'Kopēšana nav pieejama šajā vidē'), 'error')
      return
    }
    navigator.clipboard.writeText(order.id)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => showToast(l('Не удалось скопировать ID', 'Failed to copy ID', 'Neizdevās nokopēt ID'), 'error'))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleCopyId}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {l('Скопировать ID', 'Copy ID', 'Kopēt ID')}
        </button>
        {copied && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            {l('✓ Скопировано', '✓ Copied', '✓ Nokopēts')}
          </span>
        )}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => editingOrderId === order.id ? cancelEdit() : startEdit(order)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${editingOrderId === order.id
            ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
            : 'border-primary/50 dark:border-primary/50 text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10'}`}
        >
          {editingOrderId === order.id
            ? l('Отменить правку', 'Cancel editing', 'Atcelt rediģēšanu')
            : `✏ ${l('Редактировать', 'Edit', 'Rediģēt')}`}
        </button>
      )}
      <a
        href={`mailto:${order.email}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {l('Написать клиенту', 'Email customer', 'Rakstīt klientam')}
      </a>
      <button
        type="button"
        onClick={() => setInvoiceOrder(order)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
      >
        📄 {l('Счёт', 'Invoice', 'Rēķins')}
      </button>
      <a
        href={`tel:${order.phone}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {l('Позвонить', 'Call', 'Zvanīt')}
      </a>
    </div>
  )
}
