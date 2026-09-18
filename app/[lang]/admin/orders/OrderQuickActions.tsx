'use client'

import { ShipmentForm } from './ShipmentForm'
import { useState } from 'react'
import type { OrderStatus } from '@/lib/admin-store'
import { useAdminLocale } from '@/lib/use-admin-locale'
import { useToast } from '@/lib/toast-context'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  const { editingOrderId, cancelEdit, startEdit, setInvoiceOrder, deleteOrder, deletingOrderIds } = state
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
      {status === 'cancelled' && (
        <button
          type="button"
          disabled={deletingOrderIds.has(order.id)}
          onClick={async () => {
            const confirmed = window.confirm(l(
              `Удалить заказ ${order.id} навсегда? Это действие нельзя отменить.`,
              `Permanently delete order ${order.id}? This action cannot be undone.`,
              `Neatgriezeniski dzēst pasūtījumu ${order.id}? Šo darbību nevar atsaukt.`
            ))
            if (!confirmed) return
            if (await deleteOrder(order.id)) showToast(l('Заказ удалён', 'Order deleted', 'Pasūtījums dzēsts'), 'success')
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
        >
          {deletingOrderIds.has(order.id) ? l('Удаление…', 'Deleting…', 'Dzēš…') : l('Удалить заказ', 'Delete order', 'Dzēst pasūtījumu')}
        </button>
      )}
      <ShipmentForm order={order} />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setInvoiceOrder(order)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
            >
              📄 {l('Счёт', 'Invoice', 'Rēķins')}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {l(
              'Счёт на LV/EN: просмотр PDF, скачивание и отправка на выбранный email.',
              'Invoice in LV/EN: preview PDF, download and send to a chosen email.',
              'Rēķins LV/EN: PDF priekšskatījums, lejupielāde un nosūtīšana uz izvēlēto e-pastu.'
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <a
        href={`tel:${order.phone}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {l('Позвонить', 'Call', 'Zvanīt')}
      </a>
    </div>
  )
}
