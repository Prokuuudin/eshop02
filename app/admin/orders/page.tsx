'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore, type OrderStatus } from '@/lib/admin-store'
import { formatDate, formatEuro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Printer, Download } from 'lucide-react'
import { useTranslation } from '@/lib/use-translation'
import { logAdminAction } from '@/lib/admin-log-store'
import { useOrders as useOrdersStore } from '@/lib/orders-store'
import OrderInvoiceModal from '@/components/admin/OrderInvoiceModal'

type SortField = 'date' | 'total'
type SortDir = 'asc' | 'desc'

const STATUS_LIST: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Новый',
  confirmed: 'Подтверждён',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  shipped: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-indigo-200',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Не оплачен',
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  failed: 'Ошибка оплаты',
}

const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

const DELIVERY_LABELS: Record<string, string> = {
  courier: 'Курьер',
  pickup: 'Самовывоз',
  post: 'Почта',
}

type CatalogProduct = { id: string; title: string; brand: string; price: number; stock: number; image?: string; sku?: string }
type EditItem = { id: string; title: string; price: number; quantity: number; image?: string }

const EDIT_DELIVERY_COSTS: Record<string, number> = { courier: 5, pickup: 0, post: 3 }

export default function AdminOrdersPage() {
  const { orders } = useOrders()
  const { getOrderStatus, setOrderStatus, getOrderNote, setOrderNote, loadOrderMeta } = useAdminStore()
  const { upsertOrder } = useOrdersStore()

  useEffect(() => {
    fetch('/api/admin/orders?take=200')
      .then((r) => r.json())
      .then(({ orders: dbOrders }) => {
        if (!Array.isArray(dbOrders)) return
        const ids: string[] = []
        for (const o of dbOrders) {
          upsertOrder(o as import('@/lib/orders-store').Order)
          ids.push(o.id)
        }
        if (ids.length) loadOrderMeta(ids)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  // ── Edit mode ─────────────────────────────────────────────────────────────
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [editAddress, setEditAddress] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editPostalCode, setEditPostalCode] = useState('')
  const [editDelivery, setEditDelivery] = useState<string>('pickup')
  const [editProductSearch, setEditProductSearch] = useState('')
  const [catalog, setCatalog] = useState<CatalogProduct[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const { language } = useTranslation()
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'

  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setSearch(q)
  }, [searchParams])
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [deliveryFilter, setDeliveryFilter] = useState('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [invoiceOrder, setInvoiceOrder] = useState<import('@/lib/orders-store').Order | null>(null)
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | ''>('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  const statsByStatus = useMemo(() => {
    return STATUS_LIST.reduce(
      (acc, s) => {
        acc[s] = orders.filter((o) => getOrderStatus(o.id) === s).length
        return acc
      },
      {} as Record<OrderStatus, number>
    )
  }, [orders, getOrderStatus])

  const totalRevenue = useMemo(() => orders.reduce((sum, o) => sum + o.total, 0), [orders])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const result = orders.filter((order) => {
      const matchSearch =
        !q ||
        order.id.toLowerCase().includes(q) ||
        order.firstName.toLowerCase().includes(q) ||
        order.lastName.toLowerCase().includes(q) ||
        order.email.toLowerCase().includes(q) ||
        order.phone.toLowerCase().includes(q)

      const orderStatus = getOrderStatus(order.id)
      const matchStatus = statusFilter === 'all' || orderStatus === statusFilter
      const matchPayment = paymentFilter === 'all' || (order.paymentStatus ?? 'unpaid') === paymentFilter
      const matchDelivery = deliveryFilter === 'all' || order.deliveryMethod === deliveryFilter

      return matchSearch && matchStatus && matchPayment && matchDelivery
    })

    result.sort((a, b) => {
      if (sortField === 'date') {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        return sortDir === 'asc' ? diff : -diff
      }
      const diff = a.total - b.total
      return sortDir === 'asc' ? diff : -diff
    })

    return result
  }, [orders, search, statusFilter, paymentFilter, deliveryFilter, sortField, sortDir, getOrderStatus])

  // Reset page when filters change
  React.useEffect(() => { setPage(0) }, [search, statusFilter, paymentFilter, deliveryFilter, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const unhandledCount = useMemo(
    () => orders.filter((o) => ['pending', 'confirmed'].includes(getOrderStatus(o.id))).length,
    [orders, getOrderStatus]
  )

  const isAllSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id))
  const isSomeSelected = filtered.some((o) => selectedIds.has(o.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)))
    }
  }

  const applyBulkStatus = () => {
    if (!bulkStatus) return
    const ids = Array.from(selectedIds)
    ids.forEach((id) => {
      const prev = getOrderStatus(id)
      setOrderStatus(id, bulkStatus as OrderStatus)
      logAdminAction('order.status_changed', { type: 'order', id }, {
        before: { status: prev }, after: { status: bulkStatus },
      })
    })
    logAdminAction('order.bulk_status_changed',
      { type: 'orders', id: ids.join(','), title: `${ids.length} заказов` },
      { after: { status: bulkStatus }, details: `${ids.length} заказов → ${bulkStatus}` }
    )
    setSelectedIds(new Set())
    setBulkStatus('')
  }

  const printSelected = () => {
    const selected = orders.filter((o) => selectedIds.has(o.id))
    const rows = selected.map((order) => {
      const status = getOrderStatus(order.id)
      const payStatus = order.paymentStatus ?? 'unpaid'
      const items = order.items.map((item) =>
        `<div style="display:flex;justify-content:space-between;font-size:12px;margin:3px 0">
          <span>${item.title} × ${item.quantity}</span>
          <span>${formatEuro(item.price * item.quantity, locale)}</span>
        </div>`
      ).join('')
      return `<div style="margin-bottom:20px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-family:monospace;font-size:11px;color:#6b7280">${order.id}</span>
          <div style="display:flex;gap:8px">
            <span style="font-size:12px;font-weight:600">${STATUS_LABELS[status]}</span>
            <span style="font-size:12px;color:#6b7280">${PAYMENT_LABELS[payStatus]}</span>
          </div>
        </div>
        <p style="margin:2px 0;font-size:14px;font-weight:600">${order.firstName} ${order.lastName}</p>
        <p style="margin:2px 0;font-size:12px;color:#374151">${order.email} · ${order.phone}</p>
        <p style="margin:2px 0;font-size:12px;color:#374151">${order.address}, ${order.city}${order.postalCode ? ', ' + order.postalCode : ''}</p>
        <p style="margin:2px 0 8px;font-size:11px;color:#9ca3af">${new Date(order.createdAt).toLocaleDateString('ru-RU')}</p>
        <hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb"/>
        ${items}
        <hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb"/>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px">
          <span>Итого</span><span>${formatEuro(order.total, locale)}</span>
        </div>
      </div>`
    }).join('')

    const win = window.open('', '_blank', 'width=820,height=700')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Заказы</title>
      <style>body{font-family:sans-serif;padding:20px;max-width:760px;margin:0 auto}@media print{body{padding:0}}</style>
      </head><body>${rows}</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  // ── Edit helpers ─────────────────────────────────────────────────────────

  const editProductResults = useMemo(() => {
    const q = editProductSearch.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return catalog
      .filter((p) => p.title.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [catalog, editProductSearch])

  const startEdit = (order: (typeof orders)[number]) => {
    setEditingOrderId(order.id)
    setEditItems(order.items.map((i) => ({ id: i.id, title: i.title, price: i.price, quantity: i.quantity, image: i.image })))
    setEditAddress(order.address)
    setEditCity(order.city)
    setEditPostalCode(order.postalCode ?? '')
    setEditDelivery(order.deliveryMethod)
    setEditProductSearch('')
    if (catalog.length === 0) {
      fetch('/api/admin/products')
        .then((r) => r.json())
        .then((d: { data?: { products?: CatalogProduct[] } }) => setCatalog(d.data?.products ?? []))
        .catch(() => {})
    }
  }

  const cancelEdit = () => {
    setEditingOrderId(null)
    setEditProductSearch('')
  }

  const saveEdit = (order: (typeof orders)[number]) => {
    const newSubtotal = editItems.reduce((s, i) => s + i.price * i.quantity, 0)
    const newDelivery = EDIT_DELIVERY_COSTS[editDelivery] ?? order.delivery
    // Keep discount proportional if it existed
    const origDiscountPct = order.subtotal > 0 ? order.discount / order.subtotal : 0
    const newDiscount = order.promoCode && origDiscountPct > 0
      ? Math.round(newSubtotal * origDiscountPct * 100) / 100
      : order.discount
    const newTotal = Math.max(0, newSubtotal - newDiscount + newDelivery + order.tax)

    setEditSaving(true)
    const updated = {
      ...order,
      items: editItems as typeof order.items,
      address: editAddress.trim() || order.address,
      city: editCity.trim() || order.city,
      postalCode: editPostalCode.trim() || undefined,
      deliveryMethod: editDelivery as typeof order.deliveryMethod,
      subtotal: newSubtotal,
      discount: newDiscount,
      delivery: newDelivery,
      total: newTotal,
    }
    upsertOrder(updated)

    logAdminAction('order.status_changed', { type: 'order', id: order.id, title: `${order.firstName} ${order.lastName}` }, {
      details: `Редактирование заказа: ${editItems.length} позиций, итого ${newTotal.toFixed(2)} €`,
    })

    setEditSaving(false)
    setEditingOrderId(null)
    setEditProductSearch('')
  }

  const editUpdateQty = (itemId: string, qty: number) => {
    if (qty <= 0) {
      setEditItems((prev) => prev.filter((i) => i.id !== itemId))
    } else {
      setEditItems((prev) => prev.map((i) => i.id === itemId ? { ...i, quantity: qty } : i))
    }
  }

  const editAddProduct = (p: CatalogProduct) => {
    setEditItems((prev) => {
      const existing = prev.find((i) => i.id === p.id)
      if (existing) return prev.map((i) => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { id: p.id, title: p.title, price: p.price, quantity: 1, image: p.image }]
    })
    setEditProductSearch('')
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const downloadCSV = (rows: string[][], filename: string) => {
    const content = rows
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const csvDate = () => new Date().toISOString().slice(0, 10)

  const exportOrdersCSV = () => {
    const header = ['ID', 'Дата', 'Имя', 'Фамилия', 'Email', 'Телефон', 'Статус', 'Оплата', 'Доставка', 'Адрес', 'Город', 'Индекс', 'Товары', 'Сумма']
    const rows = filtered.map((o) => {
      const status = getOrderStatus(o.id)
      return [
        o.id,
        new Date(o.createdAt).toLocaleDateString('ru-RU'),
        o.firstName,
        o.lastName,
        o.email,
        o.phone,
        STATUS_LABELS[status],
        PAYMENT_LABELS[o.paymentStatus ?? 'unpaid'],
        DELIVERY_LABELS[o.deliveryMethod] ?? o.deliveryMethod,
        o.address,
        o.city,
        o.postalCode ?? '',
        o.items.map((i) => `${i.title} ×${i.quantity}`).join('; '),
        o.total.toFixed(2),
      ]
    })
    downloadCSV([header, ...rows], `orders-${csvDate()}.csv`)
  }

  const exportCustomersCSV = () => {
    const seen = new Set<string>()
    const header = ['Имя', 'Фамилия', 'Email', 'Телефон', 'Город', 'Заказов', 'Сумма (€)']
    const rows: string[][] = []
    filtered.forEach((o) => {
      if (seen.has(o.email)) return
      seen.add(o.email)
      const customerOrders = filtered.filter((x) => x.email === o.email)
      const spent = customerOrders.reduce((s, x) => s + x.total, 0)
      rows.push([o.firstName, o.lastName, o.email, o.phone, o.city, String(customerOrders.length), spent.toFixed(2)])
    })
    downloadCSV([header, ...rows], `customers-${csvDate()}.csv`)
  }

  return (
    <main className="w-full py-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-foreground">Заказы</h1>
          {unhandledCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              {unhandledCount} необработанных
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/orders/new">
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white">+ Создать заказ</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={exportOrdersCSV} className="hidden sm:inline-flex gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Заказы (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={exportCustomersCSV} className="hidden sm:inline-flex gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Клиенты (CSV)
          </Button>
          <Link href="/admin" className="hidden sm:block">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="col-span-2 md:col-span-2 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Выручка</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{formatEuro(totalRevenue, locale)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{orders.length} заказов всего</p>
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

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <div className="flex flex-1 min-w-[220px] items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по ID, имени, email, телефону..."
              className="h-9 flex-1"
            />
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-3 sm:contents gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto"
            >
              <option value="all">Все статусы</option>
              {STATUS_LIST.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto"
            >
              <option value="all">Все оплаты</option>
              <option value="unpaid">Не оплачен</option>
              <option value="pending">Ожидает оплаты</option>
              <option value="paid">Оплачен</option>
              <option value="failed">Ошибка оплаты</option>
            </select>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto"
            >
              <option value="all">Все доставки</option>
              <option value="courier">Курьер</option>
              <option value="pickup">Самовывоз</option>
              <option value="post">Почта</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <label className="flex items-center gap-1.5 cursor-pointer mr-2">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={(el) => { if (el) el.indeterminate = isSomeSelected && !isAllSelected }}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground">Выбрать все</span>
          </label>
          <span className="text-xs">Сортировка:</span>
          <button
            type="button"
            onClick={() => toggleSort('date')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              sortField === 'date'
                ? 'bg-primary/10 text-primary dark:bg-primary/20/40 dark:text-primary'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
            }`}
          >
            По дате {sortField === 'date' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            type="button"
            onClick={() => toggleSort('total')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              sortField === 'total'
                ? 'bg-primary/10 text-primary dark:bg-primary/20/40 dark:text-primary'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-muted-foreground'
            }`}
          >
            По сумме {sortField === 'total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
          </button>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} из {orders.length}
          </span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 dark:border-primary/50 bg-primary/5 dark:bg-primary/15 px-4 py-3">
          <span className="text-sm font-medium text-primary dark:text-indigo-200">
            Выбрано: {selectedIds.size}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as OrderStatus | '')}
              className="rounded-lg border border-primary/50 dark:border-primary bg-card px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">Изменить статус...</option>
              {STATUS_LIST.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <Button size="sm" disabled={!bulkStatus} onClick={applyBulkStatus}>
              Применить
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={printSelected} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            Печать
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto text-primary dark:text-primary">
            Снять выбор
          </Button>
        </div>
      )}

      {/* Orders list */}
      <div className="space-y-3">
        {pageItems.map((order) => {
          const status = getOrderStatus(order.id)
          const isExpanded = expandedOrder === order.id
          const payStatus = order.paymentStatus ?? 'unpaid'

          return (
            <div
              key={order.id}
              className={[
                'rounded-xl border overflow-hidden transition-colors',
                selectedIds.has(order.id)
                  ? 'border-primary/50 dark:border-primary bg-primary/5/40 dark:bg-primary/20/10'
                  : 'border-border bg-muted',
              ].join(' ')}
            >
              <div className="flex items-start px-5 py-4 hover:bg-black/[.02] dark:hover:bg-white/[.02] transition-colors">
                <div className="flex items-center pt-1.5 mr-3 shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(order.id)}
                    onChange={() => toggleSelect(order.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Выбрать заказ ${order.id}`}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-primary cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  aria-expanded={isExpanded}
                  className="flex-1 text-left flex flex-wrap items-start gap-3"
                >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{order.id}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${PAYMENT_COLORS[payStatus]}`}>
                      {PAYMENT_LABELS[payStatus]}
                    </span>
                    <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                      {DELIVERY_LABELS[order.deliveryMethod] ?? order.deliveryMethod}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">
                    {order.firstName} {order.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.email} · {order.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(order.createdAt, locale)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-foreground">{formatEuro(order.total, locale)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.items.length} {order.items.length === 1 ? 'товар' : order.items.length < 5 ? 'товара' : 'товаров'}
                  </p>
                </div>
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-border px-5 py-5 space-y-5">

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(order.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Скопировать ID
                    </button>
                    {!['shipped', 'delivered', 'cancelled'].includes(status) && (
                      <button
                        type="button"
                        onClick={() => editingOrderId === order.id ? cancelEdit() : startEdit(order)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${editingOrderId === order.id ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300' : 'border-primary/50 dark:border-primary/50 text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-indigo-900/20'}`}
                      >
                        {editingOrderId === order.id ? 'Отменить правку' : '✏ Редактировать'}
                      </button>
                    )}
                    <a
                      href={`mailto:${order.email}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Написать клиенту
                    </a>
                    <button
                      type="button"
                      onClick={() => setInvoiceOrder(order)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 dark:border-primary/50 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      📄 Счёт
                    </button>
                    <a
                      href={`tel:${order.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Позвонить
                    </a>
                  </div>

                  {/* ── EDIT FORM ─────────────────────────────────────────── */}
                  {editingOrderId === order.id && (
                    <div className="rounded-xl border-2 border-primary/30 dark:border-primary/50 bg-primary/5/30 dark:bg-primary/20/10 p-4 space-y-5">
                      <p className="text-sm font-semibold text-primary dark:text-indigo-200">Редактирование заказа</p>

                      {/* Address */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Адрес доставки</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            value={editAddress}
                            onChange={(e) => setEditAddress(e.target.value)}
                            placeholder="Адрес"
                            className="sm:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <input
                            value={editPostalCode}
                            onChange={(e) => setEditPostalCode(e.target.value)}
                            placeholder="Индекс"
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <input
                            value={editCity}
                            onChange={(e) => setEditCity(e.target.value)}
                            placeholder="Город"
                            className="sm:col-span-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                        </div>
                      </div>

                      {/* Delivery method */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Способ доставки</p>
                        <div className="flex flex-wrap gap-2">
                          {(['pickup', 'courier', 'post'] as const).map((dm) => (
                            <button key={dm} type="button"
                              onClick={() => setEditDelivery(dm)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${editDelivery === dm ? 'border-primary/70 bg-primary/10 text-primary dark:border-primary dark:bg-primary/20/40 dark:text-indigo-200' : 'border-border text-muted-foreground hover:border-gray-400'}`}
                            >
                              {DELIVERY_LABELS[dm]} {EDIT_DELIVERY_COSTS[dm] === 0 ? '(бесплатно)' : `(€${EDIT_DELIVERY_COSTS[dm]})`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Items */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Позиции заказа</p>
                        <div className="rounded-lg border border-border divide-y divide-gray-100 dark:divide-gray-800 bg-card">
                          {editItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                              {item.image && <img src={item.image} alt="" className="w-9 h-9 rounded object-cover shrink-0" />}
                              <p className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
                              <span className="text-xs text-gray-400 shrink-0">€{item.price.toFixed(2)}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button type="button" onClick={() => editUpdateQty(item.id, item.quantity - 1)} className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none">−</button>
                                <span className="w-7 text-center text-sm tabular-nums">{item.quantity}</span>
                                <button type="button" onClick={() => editUpdateQty(item.id, item.quantity + 1)} className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none">+</button>
                              </div>
                              <span className="text-sm font-medium text-foreground w-16 text-right tabular-nums shrink-0">€{(item.price * item.quantity).toFixed(2)}</span>
                              <button type="button" onClick={() => editUpdateQty(item.id, 0)} className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none shrink-0">×</button>
                            </div>
                          ))}
                        </div>

                        {/* Add product search */}
                        <div className="relative">
                          <input
                            value={editProductSearch}
                            onChange={(e) => setEditProductSearch(e.target.value)}
                            placeholder="Добавить товар (введите название или SKU)..."
                            className="w-full rounded-lg border border-dashed border-primary/50 dark:border-primary/50 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
                          />
                          {editProductResults.length > 0 && (
                            <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-xl max-h-60 overflow-y-auto">
                              {editProductResults.map((p) => (
                                <button key={p.id} type="button" onClick={() => editAddProduct(p)}
                                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-primary/5 dark:hover:bg-indigo-900/20 border-b border-gray-100 dark:border-gray-800 last:border-0">
                                  {p.image && <img src={p.image} alt="" className="h-8 w-8 rounded object-cover shrink-0" />}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm text-foreground truncate">{p.title}</p>
                                    <p className="text-xs text-gray-400">{p.brand}{p.sku ? ` · ${p.sku}` : ''}</p>
                                  </div>
                                  <span className="text-sm font-semibold text-foreground shrink-0">€{p.price.toFixed(2)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Recalculated summary */}
                      {editItems.length > 0 && (() => {
                        const newSub = editItems.reduce((s, i) => s + i.price * i.quantity, 0)
                        const newDel = EDIT_DELIVERY_COSTS[editDelivery] ?? 0
                        const origPct = order.subtotal > 0 ? order.discount / order.subtotal : 0
                        const newDisc = order.promoCode && origPct > 0 ? Math.round(newSub * origPct * 100) / 100 : order.discount
                        const newTotal = Math.max(0, newSub - newDisc + newDel)
                        return (
                          <div className="flex justify-end">
                            <div className="text-sm space-y-1 min-w-[220px]">
                              <div className="flex justify-between gap-4 text-muted-foreground"><span>Товары</span><span className="tabular-nums">€{newSub.toFixed(2)}</span></div>
                              {newDisc > 0 && <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400"><span>Скидка</span><span className="tabular-nums">−€{newDisc.toFixed(2)}</span></div>}
                              <div className="flex justify-between gap-4 text-muted-foreground"><span>Доставка</span><span className="tabular-nums">{newDel === 0 ? 'Бесплатно' : `€${newDel.toFixed(2)}`}</span></div>
                              <div className="flex justify-between gap-4 font-bold text-base text-foreground pt-1 border-t border-border"><span>Итого</span><span className="tabular-nums">€{newTotal.toFixed(2)}</span></div>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Save / Cancel */}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={editSaving || editItems.length === 0}
                          onClick={() => saveEdit(order)}
                          className="rounded-lg bg-primary hover:bg-primary/90 text-white px-4 py-2 text-sm font-medium disabled:opacity-40 transition-colors"
                        >
                          {editSaving ? 'Сохранение...' : 'Сохранить изменения'}
                        </button>
                        <button type="button" onClick={cancelEdit} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Info blocks */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Customer */}
                    <div className="rounded-lg border border-border p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Клиент</p>
                      <p className="text-sm font-medium text-foreground">{order.firstName} {order.lastName}</p>
                      <a href={`mailto:${order.email}`} className="block text-sm text-primary hover:underline truncate">{order.email}</a>
                      <a href={`tel:${order.phone}`} className="block text-sm text-gray-700 dark:text-gray-300 hover:underline">{order.phone}</a>
                    </div>

                    {/* Delivery */}
                    <div className="rounded-lg border border-border p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Доставка</p>
                      <p className="text-sm font-medium text-foreground">{DELIVERY_LABELS[order.deliveryMethod] ?? order.deliveryMethod}</p>
                      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                        <p>{order.address}</p>
                        {order.postalCode && <p>Индекс: {order.postalCode}</p>}
                        <p>{order.city}</p>
                      </div>
                    </div>

                    {/* Payment */}
                    <div className="rounded-lg border border-border p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Оплата</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${PAYMENT_COLORS[payStatus]}`}>
                          {PAYMENT_LABELS[payStatus]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{order.paymentMethod}</p>
                      {order.paymentProvider && (
                        <p className="text-sm text-muted-foreground">Провайдер: <span className="text-foreground font-medium">{order.paymentProvider}</span></p>
                      )}
                      {order.paymentSessionId && (
                        <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
                          <p className="text-xs text-muted-foreground mb-0.5">Session ID</p>
                          <p className="font-mono text-xs text-muted-foreground break-all">{order.paymentSessionId}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2">Состав заказа</p>
                    <div className="rounded-lg border border-border divide-y divide-gray-200 dark:divide-gray-700">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.title}
                              className="w-10 h-10 object-cover rounded-md shrink-0"
                            />
                          )}
                          <p className="flex-1 min-w-0 text-sm text-foreground truncate">{item.title}</p>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} шт × {formatEuro(item.price, locale)}
                            </p>
                            <p className="text-sm font-medium text-foreground">
                              {formatEuro(item.price * item.quantity, locale)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Amounts */}
                  <div className="flex justify-end">
                    <div className="text-sm space-y-1.5 min-w-[260px]">
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">Сумма за товары</span>
                        <span className="text-foreground">{formatEuro(order.subtotal, locale)}</span>
                      </div>
                      {order.discount > 0 && (
                        <div className="flex justify-between gap-6 text-green-700 dark:text-green-400">
                          <span>Скидка{order.promoCode ? ` (${order.promoCode})` : ''}</span>
                          <span>−{formatEuro(order.discount, locale)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">Доставка</span>
                        <span className="text-foreground">
                          {order.delivery === 0 ? 'Бесплатно' : formatEuro(order.delivery, locale)}
                        </span>
                      </div>
                      {order.tax > 0 && (
                        <div className="flex justify-between gap-6">
                          <span className="text-muted-foreground">Налог (НДС)</span>
                          <span className="text-foreground">{formatEuro(order.tax, locale)}</span>
                        </div>
                      )}
                      {(order.bonusSpent ?? 0) > 0 && (
                        <div className="flex justify-between gap-6 text-amber-700 dark:text-amber-400">
                          <span>Бонусы использованы</span>
                          <span>−{order.bonusSpent}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-6 font-bold text-base pt-2 border-t border-border">
                        <span className="text-foreground">Итого</span>
                        <span className="text-foreground">{formatEuro(order.total, locale)}</span>
                      </div>
                      <div className="flex justify-between gap-6 text-emerald-700 dark:text-emerald-400 font-medium">
                        <span>Прибыль</span>
                        <span>{formatEuro(order.total - order.tax - order.delivery, locale)}</span>
                      </div>
                      {(order.bonusEarned ?? 0) > 0 && (
                        <div className="flex justify-between gap-6 text-xs text-amber-600 dark:text-amber-400">
                          <span>Бонусов начислено</span>
                          <span>+{order.bonusEarned}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status management */}
                  <div className="pt-2 border-t border-border">
                    <p className="text-sm font-semibold text-foreground mb-2">Изменить статус</p>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_LIST.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={status === s ? 'default' : 'outline'}
                          className={status === s ? 'bg-primary hover:bg-primary/90 text-white' : ''}
                          onClick={() => {
                            const prev = getOrderStatus(order.id)
                            setOrderStatus(order.id, s)
                            logAdminAction('order.status_changed', {
                              type: 'order', id: order.id,
                              title: `${order.firstName} ${order.lastName}`,
                            }, { before: { status: prev }, after: { status: s } })
                          }}
                        >
                          {STATUS_LABELS[s]}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Manager note */}
                  <div className="pt-2 border-t border-border">
                    <p className="text-sm font-semibold text-foreground mb-2">
                      Заметка менеджера
                      <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">— клиент не видит</span>
                    </p>
                    <textarea
                      rows={3}
                      value={noteDrafts[order.id] ?? getOrderNote(order.id)}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                      }
                      placeholder="Внутренний комментарий: статус пересылки, договорённости с клиентом..."
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="flex items-center gap-3 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const noteText = noteDrafts[order.id] ?? getOrderNote(order.id)
                          setOrderNote(order.id, noteText)
                          setNoteDrafts((prev) => { const n = { ...prev }; delete n[order.id]; return n })
                          logAdminAction('order.note_saved', {
                            type: 'order', id: order.id,
                            title: `${order.firstName} ${order.lastName}`,
                          }, { details: noteText })
                        }}
                        disabled={noteDrafts[order.id] === undefined || noteDrafts[order.id] === getOrderNote(order.id)}
                      >
                        Сохранить заметку
                      </Button>
                      {getOrderNote(order.id) && noteDrafts[order.id] === undefined && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Заметка сохранена</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-border p-10 bg-muted text-center text-sm text-muted-foreground">
            {orders.length === 0 ? 'Заказов пока нет' : 'Нет заказов по выбранным фильтрам'}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 pt-2">
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages} · {filtered.length} заказов
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(0)} disabled={page === 0}>«</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹</Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const offset = Math.max(0, Math.min(page - 3, totalPages - 7))
              const pg = i + offset
              return (
                <Button
                  key={pg}
                  variant={pg === page ? 'default' : 'outline'}
                  size="sm"
                  className={[
                    'hidden sm:inline-flex',
                    pg === page ? 'bg-primary text-white' : '',
                  ].join(' ')}
                  onClick={() => setPage(pg)}
                >
                  {pg + 1}
                </Button>
              )
            })}
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>›</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</Button>
          </div>
        </div>
      )}
      {invoiceOrder && (
        <OrderInvoiceModal
          order={invoiceOrder}
          open={true}
          onClose={() => setInvoiceOrder(null)}
        />
      )}
    </main>
  )
}
