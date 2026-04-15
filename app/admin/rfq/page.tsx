'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { PRODUCTS } from '@/data/products'
import { useRFQStore } from '@/lib/rfq-store'
import { formatDate, formatEuro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import AdminGate from '@/components/admin/AdminGate'

export default function AdminRFQPage() {
  const [quotePrice, setQuotePrice] = useState<Record<string, number>>({})
  const [quoteTerms, setQuoteTerms] = useState<Record<string, string>>({})
  const [quoteValidDays, setQuoteValidDays] = useState<Record<string, number>>({})

  const { getAll, setQuote, setStatus } = useRFQStore()
  const requests = useMemo(() => getAll(), [getAll])

  const sendQuote = (rfqId: string) => {
    const totalPrice = Number(quotePrice[rfqId] || 0)
    const terms = (quoteTerms[rfqId] || '').trim()
    const days = Number(quoteValidDays[rfqId] || 7)

    if (totalPrice <= 0 || !terms) {
      return
    }

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + Math.max(1, days))

    setQuote(rfqId, {
      totalPrice,
      terms,
      validUntil
    })
  }

  return (
    <AdminGate>
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">RFQ заявки</h1>
        <Link href="/admin"><Button variant="outline">Назад в админку</Button></Link>
      </div>

      <div className="space-y-4">
        {requests.map((rfq) => (
          <section key={rfq.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{rfq.id}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Компания: {rfq.companyId} · Создано: {formatDate(rfq.createdAt, 'ru-RU')}
                </p>
              </div>
              <span className="text-xs rounded px-2 py-1 bg-gray-100 dark:bg-gray-800">{rfq.status}</span>
            </div>

            <ul className="mt-3 text-sm space-y-1">
              {rfq.items.map((item, idx) => {
                const product = PRODUCTS.find((p) => p.id === item.productId)
                return <li key={idx}>{product?.title || item.productId} - {item.quantity} шт</li>
              })}
            </ul>

            {rfq.notes && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Комментарий: {rfq.notes}</p>}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="number"
                min={0}
                value={quotePrice[rfq.id] || ''}
                onChange={(e) => setQuotePrice((prev) => ({ ...prev, [rfq.id]: Number(e.target.value) }))}
                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                placeholder="Сумма предложения"
              />
              <input
                type="number"
                min={1}
                value={quoteValidDays[rfq.id] || 7}
                onChange={(e) => setQuoteValidDays((prev) => ({ ...prev, [rfq.id]: Number(e.target.value) }))}
                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                placeholder="Срок действия (дни)"
              />
              <input
                type="text"
                value={quoteTerms[rfq.id] || ''}
                onChange={(e) => setQuoteTerms((prev) => ({ ...prev, [rfq.id]: e.target.value }))}
                className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
                placeholder="Условия оплаты/поставки"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => sendQuote(rfq.id)}>Отправить quote</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(rfq.id, 'accepted')}>Отметить как accepted</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(rfq.id, 'rejected')}>Отметить как rejected</Button>
            </div>

            {rfq.quote && (
              <div className="mt-3 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm">
                <p>Quote: {formatEuro(rfq.quote.totalPrice, 'ru-RU')}</p>
                <p>До: {formatDate(rfq.quote.validUntil, 'ru-RU')}</p>
                <p>Условия: {rfq.quote.terms}</p>
              </div>
            )}
          </section>
        ))}

        {requests.length === 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 bg-gray-50 dark:bg-gray-800 text-center text-sm text-gray-600 dark:text-gray-300">
            RFQ заявок пока нет
          </div>
        )}
      </div>
    </main>
    </AdminGate>
  )
}
