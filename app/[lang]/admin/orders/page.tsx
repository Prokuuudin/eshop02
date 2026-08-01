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

import { useAdminOrdersPage } from './useAdminOrdersPage'
import OrdersHeader from './OrdersHeader'
import OrdersStatistics from './OrdersStatistics'
import OrdersFilters from './OrdersFilters'
import OrdersBulkActions from './OrdersBulkActions'
import OrdersList from './OrdersList'
import OrdersPagination from './OrdersPagination'
import OrdersInvoice from './OrdersInvoice'
export default function AdminOrdersPage(): React.ReactElement {
  const state = useAdminOrdersPage()
  return (
    <main className="w-full py-4 space-y-6">
      <OrdersHeader state={state} />
      <OrdersStatistics state={state} />
      <OrdersFilters state={state} />
      <OrdersBulkActions state={state} />
      <OrdersList state={state} />
      <OrdersPagination state={state} />
      <OrdersInvoice state={state} />
    </main>
  )
}
