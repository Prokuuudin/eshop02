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

export default function OrdersInvoice({ state }: { state: OrdersState }): React.ReactElement {
  const { orders, getOrderStatus, setOrderStatus, getOrderNote, setOrderNote, noteDrafts, setNoteDrafts, editingOrderId, editItems, editAddress, setEditAddress, editCity, setEditCity, editPostalCode, setEditPostalCode, editDelivery, setEditDelivery, editProductSearch, setEditProductSearch, editSaving, language, locale, search, setSearch, statusFilter, setStatusFilter, paymentFilter, setPaymentFilter, deliveryFilter, setDeliveryFilter, sortField, sortDir, expandedOrder, setExpandedOrder, selectedIds, setSelectedIds, invoiceOrder, setInvoiceOrder, bulkStatus, setBulkStatus, page, setPage, statsByStatus, totalRevenue, filtered, totalPages, pageItems, unhandledCount, isAllSelected, isSomeSelected, toggleSelect, toggleSelectAll, applyBulkStatus, printSelected, editProductResults, startEdit, cancelEdit, saveEdit, editUpdateQty, editAddProduct, toggleSort, exportOrdersCSV, exportCustomersCSV } = state
  return <>
{invoiceOrder && (
        <OrderInvoiceModal
          order={invoiceOrder}
          open={true}
          onClose={() => setInvoiceOrder(null)}
        />
      )}
  </>
}
