'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useOrders } from '@/lib/orders-store'
import { isOrderTaxIncluded, extractVat } from '@/lib/tax'
import { useAdminStore, type OrderStatus } from '@/lib/admin-store'
import { formatDate, formatEuro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Search, Printer, Download } from 'lucide-react'
import { useTranslation } from '@/lib/use-translation'
import { logAdminAction } from '@/lib/admin-log-store'
import { useOrders as useOrdersStore } from '@/lib/orders-store'
import OrderInvoiceModal from '@/components/admin/OrderInvoiceModal'
import {
  DELIVERY_LABELS,
  EDIT_DELIVERY_COSTS,
  ORDERS_PAGE_SIZE,
  PAYMENT_COLORS,
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_LIST,
  type CatalogProduct,
  type EditItem,
  type SortDir,
  type SortField,
} from './order-config'

import type { useAdminOrdersPage } from './useAdminOrdersPage'

type OrdersState = ReturnType<typeof useAdminOrdersPage>

export default function OrdersStatistics({ state }: { state: OrdersState }): React.ReactElement {
  const { orders, getOrderStatus, setOrderStatus, getOrderNote, setOrderNote, noteDrafts, setNoteDrafts, editingOrderId, editItems, editAddress, setEditAddress, editCity, setEditCity, editPostalCode, setEditPostalCode, editDelivery, setEditDelivery, editProductSearch, setEditProductSearch, editSaving, language, locale, search, setSearch, statusFilter, setStatusFilter, paymentFilter, setPaymentFilter, deliveryFilter, setDeliveryFilter, sortField, sortDir, expandedOrder, setExpandedOrder, selectedIds, setSelectedIds, invoiceOrder, setInvoiceOrder, bulkStatus, setBulkStatus, page, setPage, statsByStatus, totalRevenue, filtered, totalPages, pageItems, unhandledCount, isAllSelected, isSomeSelected, toggleSelect, toggleSelectAll, applyBulkStatus, printSelected, editProductResults, startEdit, cancelEdit, saveEdit, editUpdateQty, editAddProduct, toggleSort, exportOrdersCSV, exportCustomersCSV } = state
  return <>
<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="col-span-2 md:col-span-2 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Ð’Ñ‹Ñ€ÑƒÑ‡ÐºÐ°</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{formatEuro(totalRevenue, locale)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{orders.length} Ð·Ð°ÐºÐ°Ð·Ð¾Ð² Ð²ÑÐµÐ³Ð¾</p>
        </div>
        {STATUS_LIST.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
              statusFilter === s
                ? 'border-primary/70 bg-primary/5 dark:border-primary dark:bg-primary/10'
                : 'border-border bg-card hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <p className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{statsByStatus[s] ?? 0}</p>
          </button>
        ))}
      </div>
  </>
}
