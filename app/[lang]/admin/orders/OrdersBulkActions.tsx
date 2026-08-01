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

export default function OrdersBulkActions({ state }: { state: OrdersState }): React.ReactElement {
  const { orders, getOrderStatus, setOrderStatus, getOrderNote, setOrderNote, noteDrafts, setNoteDrafts, editingOrderId, editItems, editAddress, setEditAddress, editCity, setEditCity, editPostalCode, setEditPostalCode, editDelivery, setEditDelivery, editProductSearch, setEditProductSearch, editSaving, language, locale, search, setSearch, statusFilter, setStatusFilter, paymentFilter, setPaymentFilter, deliveryFilter, setDeliveryFilter, sortField, sortDir, expandedOrder, setExpandedOrder, selectedIds, setSelectedIds, invoiceOrder, setInvoiceOrder, bulkStatus, setBulkStatus, page, setPage, statsByStatus, totalRevenue, filtered, totalPages, pageItems, unhandledCount, isAllSelected, isSomeSelected, toggleSelect, toggleSelectAll, applyBulkStatus, printSelected, editProductResults, startEdit, cancelEdit, saveEdit, editUpdateQty, editAddProduct, toggleSort, exportOrdersCSV, exportCustomersCSV } = state
  return <>
{selectedIds.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 dark:border-primary/50 bg-primary/5 dark:bg-primary/15 px-4 py-3">
          <span className="text-sm font-medium text-primary dark:text-primary/60">
            Ð’Ñ‹Ð±Ñ€Ð°Ð½Ð¾: {selectedIds.size}
          </span>
          <div className="flex items-center gap-2">
            <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as OrderStatus | '')}>
              <SelectTrigger className="rounded-lg border border-primary/50 dark:border-primary bg-card px-3 py-1.5 text-sm text-foreground">
                <SelectValue placeholder="Ð˜Ð·Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ ÑÑ‚Ð°Ñ‚ÑƒÑ..." />
              </SelectTrigger>
              <SelectContent>
                {STATUS_LIST.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!bulkStatus} onClick={applyBulkStatus}>
              ÐŸÑ€Ð¸Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={printSelected} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            ÐŸÐµÑ‡Ð°Ñ‚ÑŒ
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto text-primary dark:text-primary">
            Ð¡Ð½ÑÑ‚ÑŒ Ð²Ñ‹Ð±Ð¾Ñ€
          </Button>
        </div>
      )}
  </>
}
