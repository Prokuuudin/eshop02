'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { PRODUCTS, type Product } from '@/data/products'
import { getCurrentUser } from '@/lib/auth'
import { useRFQStore } from '@/lib/rfq-store'
import { logAuditAction } from '@/lib/audit-log-store'
import { formatDate, formatEuro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast-context'

type DraftItem = {
  productId: string
  quantity: number
}

export default function RequestQuotePage() {
  const user = getCurrentUser()
  const { showToast } = useToast()
  const { createRequest, getByCompany, setStatus } = useRFQStore()
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)

  const [items, setItems] = useState<DraftItem[]>([{ productId: '', quantity: 10 }])
  const [notes, setNotes] = useState('')

  const companyId = user?.companyId
  const rfqList = useMemo(() => (companyId ? getByCompany(companyId) : []), [companyId, getByCompany])

  React.useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch('/api/products', { cache: 'no-store' })
        if (!response.ok) throw new Error('failed')
        const payload = (await response.json()) as { data?: { products?: Product[] } }
        const nextProducts = payload.data?.products ?? []
        setProducts(nextProducts)
        setItems((prev) => prev.map((item, index) => (index === 0 && !item.productId
          ? { ...item, productId: nextProducts[0]?.id ?? '' }
          : item
        )))
      } catch {
        setProducts(PRODUCTS)
        setItems((prev) => prev.map((item, index) => (index === 0 && !item.productId
          ? { ...item, productId: PRODUCTS[0]?.id ?? '' }
          : item
        )))
      } finally {
        setProductsLoading(false)
      }
    }

    void loadProducts()
  }, [])

  const addRow = () => {
    setItems((prev) => [...prev, { productId: products[0]?.id || '', quantity: 10 }])
  }

  const removeRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) {
      showToast('RFQ доступен только для B2B-аккаунтов', 'error')
      return
    }

    const normalized = items
      .filter((item) => item.productId && item.quantity > 0)
      .map((item) => ({ productId: item.productId, quantity: Math.floor(item.quantity) }))

    if (normalized.length === 0) {
      showToast('Добавьте хотя бы один товар', 'error')
      return
    }

    const rfqId = createRequest({
      companyId,
      items: normalized,
      notes: notes.trim(),
      createdByUserId: user?.id
    })

    if (user?.companyId) {
      logAuditAction(user.companyId, user.id, 'rfq_created', { rfqId, items: normalized.length })
    }

    showToast('Запрос на спецпредложение отправлен', 'success')
    setItems([{ productId: products[0]?.id || '', quantity: 10 }])
    setNotes('')
  }

  const acceptQuote = (rfqId: string) => {
    setStatus(rfqId, 'accepted')
    showToast('Предложение принято', 'success')
  }

  const rejectQuote = (rfqId: string) => {
    setStatus(rfqId, 'rejected')
    showToast('Предложение отклонено', 'info')
  }

  if (!companyId) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">Запросить спецпредложение</h1>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-10 text-center bg-gray-50 dark:bg-gray-800">
          <p className="text-gray-700 dark:text-gray-300 mb-4">Функция доступна только для B2B-компаний.</p>
          <Link href="/account">
            <Button variant="outline">Перейти в аккаунт</Button>
          </Link>
        </div>
      </main>
    )
  }

  if (productsLoading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-12">
        <p className="text-sm text-gray-600 dark:text-gray-300">Загрузка товаров...</p>
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">RFQ: Запрос спецпредложения</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          Отправьте список товаров и объёмы, менеджер подготовит персональное предложение.
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_140px_100px] gap-2">
                <select
                  value={item.productId}
                  onChange={(e) => updateRow(index, { productId: e.target.value })}
                  className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
                  className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                  placeholder="Кол-во"
                />

                <Button type="button" variant="outline" onClick={() => removeRow(index)} disabled={items.length === 1}>
                  Удалить
                </Button>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addRow}>
            + Добавить товар
          </Button>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm min-h-[100px]"
            placeholder="Комментарий к заявке: желаемые условия, сроки, требования"
          />

          <Button type="submit">Отправить RFQ</Button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Мои заявки</h2>
        <div className="space-y-3">
          {rfqList.map((rfq) => (
            <div key={rfq.id} className="rounded border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{rfq.id}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Создано: {formatDate(rfq.createdAt, 'ru-RU')}</p>
                </div>
                <span className="text-xs rounded px-2 py-1 bg-gray-100 dark:bg-gray-800">{rfq.status}</span>
              </div>

              <ul className="mt-3 text-sm space-y-1">
                {rfq.items.map((item, idx) => {
                  const product = products.find((p) => p.id === item.productId)
                  return (
                    <li key={idx} className="text-gray-700 dark:text-gray-300">
                      {product?.title || item.productId} - {item.quantity} шт
                    </li>
                  )
                })}
              </ul>

              {rfq.notes && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Комментарий: {rfq.notes}</p>}

              {rfq.quote && (
                <div className="mt-3 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Предложение получено</p>
                  <p className="text-sm mt-1">Сумма: {formatEuro(rfq.quote.totalPrice, 'ru-RU')}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Действительно до: {formatDate(rfq.quote.validUntil, 'ru-RU')}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Условия: {rfq.quote.terms}</p>

                  {rfq.status === 'quoted' && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => acceptQuote(rfq.id)}>Принять</Button>
                      <Button size="sm" variant="outline" onClick={() => rejectQuote(rfq.id)}>Отклонить</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {rfqList.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-400">Заявок пока нет</p>}
        </div>
      </section>
    </main>
  )
}
