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

export default function OrdersFilters({ state }: { state: OrdersState }): React.ReactElement {
  const { orders, getOrderStatus, setOrderStatus, getOrderNote, setOrderNote, noteDrafts, setNoteDrafts, editingOrderId, editItems, editAddress, setEditAddress, editCity, setEditCity, editPostalCode, setEditPostalCode, editDelivery, setEditDelivery, editProductSearch, setEditProductSearch, editSaving, language, locale, search, setSearch, statusFilter, setStatusFilter, paymentFilter, setPaymentFilter, deliveryFilter, setDeliveryFilter, sortField, sortDir, expandedOrder, setExpandedOrder, selectedIds, setSelectedIds, invoiceOrder, setInvoiceOrder, bulkStatus, setBulkStatus, page, setPage, statsByStatus, totalRevenue, filtered, totalPages, pageItems, unhandledCount, isAllSelected, isSomeSelected, toggleSelect, toggleSelectAll, applyBulkStatus, printSelected, editProductResults, startEdit, cancelEdit, saveEdit, editUpdateQty, editAddProduct, toggleSort, exportOrdersCSV, exportCustomersCSV } = state
  return <>
<div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <div className="flex flex-1 min-w-[220px] items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ÐŸÐ¾Ð¸ÑÐº Ð¿Ð¾ ID, Ð¸Ð¼ÐµÐ½Ð¸, email, Ñ‚ÐµÐ»ÐµÑ„Ð¾Ð½Ñƒ..."
              className="h-9 flex-1"
            />
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-3 sm:contents gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | 'all')}>
              <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ð’ÑÐµ ÑÑ‚Ð°Ñ‚ÑƒÑÑ‹</SelectItem>
                {STATUS_LIST.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ð’ÑÐµ Ð¾Ð¿Ð»Ð°Ñ‚Ñ‹</SelectItem>
                <SelectItem value="unpaid">ÐÐµ Ð¾Ð¿Ð»Ð°Ñ‡ÐµÐ½</SelectItem>
                <SelectItem value="pending">ÐžÐ¶Ð¸Ð´Ð°ÐµÑ‚ Ð¾Ð¿Ð»Ð°Ñ‚Ñ‹</SelectItem>
                <SelectItem value="paid">ÐžÐ¿Ð»Ð°Ñ‡ÐµÐ½</SelectItem>
                <SelectItem value="failed">ÐžÑˆÐ¸Ð±ÐºÐ° Ð¾Ð¿Ð»Ð°Ñ‚Ñ‹</SelectItem>
              </SelectContent>
            </Select>
            <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
              <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ð’ÑÐµ Ð´Ð¾ÑÑ‚Ð°Ð²ÐºÐ¸</SelectItem>
                <SelectItem value="courier">ÐšÑƒÑ€ÑŒÐµÑ€</SelectItem>
                <SelectItem value="pickup">Ð¡Ð°Ð¼Ð¾Ð²Ñ‹Ð²Ð¾Ð·</SelectItem>
                <SelectItem value="post">ÐŸÐ¾Ñ‡Ñ‚Ð°</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <label htmlFor="select-all-orders" className="flex items-center gap-1.5 cursor-pointer mr-2">
            <Checkbox
              id="select-all-orders"
              checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-xs text-muted-foreground">Ð’Ñ‹Ð±Ñ€Ð°Ñ‚ÑŒ Ð²ÑÐµ</span>
          </label>
          <span className="text-xs">Ð¡Ð¾Ñ€Ñ‚Ð¸Ñ€Ð¾Ð²ÐºÐ°:</span>
          <button
            type="button"
            onClick={() => toggleSort('date')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              sortField === 'date'
                ? 'bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
            }`}
          >
            ÐŸÐ¾ Ð´Ð°Ñ‚Ðµ {sortField === 'date' ? (sortDir === 'desc' ? 'â†“' : 'â†‘') : ''}
          </button>
          <button
            type="button"
            onClick={() => toggleSort('total')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              sortField === 'total'
                ? 'bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
            }`}
          >
            ÐŸÐ¾ ÑÑƒÐ¼Ð¼Ðµ {sortField === 'total' ? (sortDir === 'desc' ? 'â†“' : 'â†‘') : ''}
          </button>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} Ð¸Ð· {orders.length}
          </span>
        </div>
      </div>
  </>
}
