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

export default function OrdersHeader({ state }: { state: OrdersState }): React.ReactElement {
  const { orders, getOrderStatus, setOrderStatus, getOrderNote, setOrderNote, noteDrafts, setNoteDrafts, editingOrderId, editItems, editAddress, setEditAddress, editCity, setEditCity, editPostalCode, setEditPostalCode, editDelivery, setEditDelivery, editProductSearch, setEditProductSearch, editSaving, language, locale, search, setSearch, statusFilter, setStatusFilter, paymentFilter, setPaymentFilter, deliveryFilter, setDeliveryFilter, sortField, sortDir, expandedOrder, setExpandedOrder, selectedIds, setSelectedIds, invoiceOrder, setInvoiceOrder, bulkStatus, setBulkStatus, page, setPage, statsByStatus, totalRevenue, filtered, totalPages, pageItems, unhandledCount, isAllSelected, isSomeSelected, toggleSelect, toggleSelectAll, applyBulkStatus, printSelected, editProductResults, startEdit, cancelEdit, saveEdit, editUpdateQty, editAddProduct, toggleSort, exportOrdersCSV, exportCustomersCSV } = state
  return <>
<div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-foreground">Ð—Ð°ÐºÐ°Ð·Ñ‹</h1>
          {unhandledCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              {unhandledCount} Ð½ÐµÐ¾Ð±Ñ€Ð°Ð±Ð¾Ñ‚Ð°Ð½Ð½Ñ‹Ñ…
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/orders/new">
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">+ Ð¡Ð¾Ð·Ð´Ð°Ñ‚ÑŒ Ð·Ð°ÐºÐ°Ð·</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={exportOrdersCSV} className="hidden sm:inline-flex gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Ð—Ð°ÐºÐ°Ð·Ñ‹ (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={exportCustomersCSV} className="hidden sm:inline-flex gap-1.5">
            <Download className="h-3.5 w-3.5" />
            ÐšÐ»Ð¸ÐµÐ½Ñ‚Ñ‹ (CSV)
          </Button>
          <Link href="/admin" className="hidden sm:block">
            <Button variant="outline">ÐÐ°Ð·Ð°Ð´ Ð² Ð°Ð´Ð¼Ð¸Ð½ÐºÑƒ</Button>
          </Link>
        </div>
      </div>
  </>
}
