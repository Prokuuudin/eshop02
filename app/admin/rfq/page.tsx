'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { PRODUCTS, type Product } from '@/data/products'
import { useRFQStore, type RFQStatus, type RFQTimelineEvent } from '@/lib/rfq-store'
import { formatDate, formatEuro } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<RFQStatus, string> = {
  pending:  'Новая',
  quoted:   'Котировка отправлена',
  accepted: 'Принята',
  rejected: 'Отклонена',
}

const STATUS_COLORS: Record<RFQStatus, string> = {
  pending:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  quoted:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

const STATUS_CARD_BORDER: Record<RFQStatus, string> = {
  pending:  'border-l-yellow-400',
  quoted:   'border-l-blue-400',
  accepted: 'border-l-green-400',
  rejected: 'border-l-red-300',
}

type TimelineEventType = RFQTimelineEvent['type']

const EVENT_LABELS: Record<TimelineEventType, string> = {
  created:    'Заявка создана',
  quote_sent: 'Котировка отправлена',
  accepted:   'Принята клиентом',
  rejected:   'Отклонена',
  note:       'Заметка',
}

const EVENT_DOT: Record<TimelineEventType, string> = {
  created:    'bg-gray-400 dark:bg-gray-500',
  quote_sent: 'bg-blue-500',
  accepted:   'bg-green-500',
  rejected:   'bg-red-400',
  note:       'bg-indigo-400',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Timeline({ events }: { events: RFQTimelineEvent[] }) {
  if (!events.length) return null
  const sorted = [...events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

      <div className="space-y-4">
        {sorted.map((ev, i) => (
          <div key={i} className="relative flex items-start gap-3">
            {/* Dot */}
            <span className={`absolute -left-6 mt-1 h-[10px] w-[10px] rounded-full border-2 border-white dark:border-gray-900 ${EVENT_DOT[ev.type]}`} />

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {EVENT_LABELS[ev.type]}
                </p>
                <time className="text-xs text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
                  {formatDate(ev.at, 'ru-RU')}
                </time>
              </div>

              {ev.type === 'quote_sent' && ev.quotePrice !== undefined && (
                <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                  <p>Сумма: <span className="font-medium text-foreground">{formatEuro(ev.quotePrice, 'ru-RU')}</span></p>
                  {ev.quoteTerms && <p>Условия: {ev.quoteTerms}</p>}
                  {ev.quoteValidUntil && <p>Действует до: {formatDate(ev.quoteValidUntil, 'ru-RU')}</p>}
                </div>
              )}

              {ev.note && ev.type !== 'quote_sent' && (
                <p className="mt-0.5 text-xs text-muted-foreground italic">{ev.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminRFQPage() {
  const [loadedProducts, setLoadedProducts] = useState<Product[]>([])
  const [quotePrice, setQuotePrice] = useState<Record<string, string>>({})
  const [quoteTerms, setQuoteTerms] = useState<Record<string, string>>({})
  const [quoteValidDays, setQuoteValidDays] = useState<Record<string, string>>({})
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<RFQStatus | 'all'>('all')

  const { getAll, setQuote, setStatus, addNote } = useRFQStore()
  const requests = useMemo(() => getAll(), [getAll])

  React.useEffect(() => {
    fetch('/api/products', { cache: 'no-store' })
      .then((r) => r.json())
      .then((p: { data?: { products?: Product[] } }) => setLoadedProducts(p.data?.products ?? []))
      .catch(() => setLoadedProducts(PRODUCTS))
  }, [])

  const products = loadedProducts.length > 0 ? loadedProducts : PRODUCTS

  const counts = useMemo(() => {
    const r: Record<RFQStatus | 'all', number> = { all: requests.length, pending: 0, quoted: 0, accepted: 0, rejected: 0 }
    requests.forEach((rfq) => { r[rfq.status]++ })
    return r
  }, [requests])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requests
    return requests.filter((r) => r.status === statusFilter)
  }, [requests, statusFilter])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sendQuote = (rfqId: string) => {
    const price = parseFloat(quotePrice[rfqId] ?? '')
    const terms = (quoteTerms[rfqId] ?? '').trim()
    const days = parseInt(quoteValidDays[rfqId] ?? '7', 10)
    if (!price || price <= 0 || !terms) return
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + Math.max(1, days || 7))
    setQuote(rfqId, { totalPrice: price, terms, validUntil })
    setQuotePrice((p) => { const n = { ...p }; delete n[rfqId]; return n })
    setQuoteTerms((p) => { const n = { ...p }; delete n[rfqId]; return n })
    setQuoteValidDays((p) => { const n = { ...p }; delete n[rfqId]; return n })
  }

  const submitNote = (rfqId: string) => {
    const note = (noteDraft[rfqId] ?? '').trim()
    if (!note) return
    addNote(rfqId, note)
    setNoteDraft((p) => { const n = { ...p }; delete n[rfqId]; return n })
  }

  const STATUS_TABS: { value: RFQStatus | 'all'; label: string }[] = [
    { value: 'all',      label: `Все (${counts.all})` },
    { value: 'pending',  label: `Новые (${counts.pending})` },
    { value: 'quoted',   label: `Котировки (${counts.quoted})` },
    { value: 'accepted', label: `Принятые (${counts.accepted})` },
    { value: 'rejected', label: `Отклонённые (${counts.rejected})` },
  ]

  return (
    <main className="w-full py-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">RFQ заявки</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Запросы на котировку от B2B клиентов
          </p>
        </div>
        <Link href="/admin"><Button variant="outline">← Назад в админку</Button></Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={[
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === tab.value
                ? 'bg-primary border-primary text-white'
                : 'border-border bg-card text-muted-foreground hover:border-gray-300 dark:hover:border-gray-600',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* RFQ list */}
      <div className="space-y-3">
        {filtered.map((rfq) => {
          const isExpanded = expanded.has(rfq.id)
          const lastEvent = rfq.timeline?.[rfq.timeline.length - 1]

          return (
            <article
              key={rfq.id}
              className={[
                'rounded-xl border border-l-4 bg-card overflow-hidden transition-colors',
                STATUS_CARD_BORDER[rfq.status],
                rfq.status === 'rejected' ? 'opacity-75' : '',
              ].join(' ')}
            >
              {/* Card header — always visible */}
              <button
                type="button"
                onClick={() => toggleExpand(rfq.id)}
                aria-expanded={isExpanded}
                className="w-full text-left px-5 py-4 flex flex-wrap items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{rfq.id}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[rfq.status]}`}>
                      {STATUS_LABELS[rfq.status]}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Компания: <span className="font-mono">{rfq.companyId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Создана: {formatDate(rfq.createdAt, 'ru-RU')}
                    {rfq.timeline.length > 1 && lastEvent && (
                      <> · Последнее обновление: {formatDate(lastEvent.at, 'ru-RU')}</>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {rfq.items.length} {rfq.items.length === 1 ? 'позиция' : rfq.items.length < 5 ? 'позиции' : 'позиций'}
                  </p>
                  {rfq.quote && (
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatEuro(rfq.quote.totalPrice, 'ru-RU')}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</p>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-5 space-y-6">

                  {/* Items */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Состав заявки</p>
                    <div className="rounded-lg border border-border divide-y divide-gray-100 dark:divide-gray-800">
                      {rfq.items.map((item, idx) => {
                        const product = products.find((p) => p.id === item.productId)
                        return (
                          <div key={idx} className="flex items-center justify-between px-3 py-2.5 gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                                {product?.title ?? item.productId}
                              </p>
                              {product?.sku && (
                                <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm text-muted-foreground">{item.quantity} шт</p>
                              {product?.price && (
                                <p className="text-xs text-gray-400">
                                  Прайс: {formatEuro(product.price * item.quantity, 'ru-RU')}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {rfq.notes && (
                      <p className="mt-2 text-sm text-muted-foreground italic">
                        Комментарий клиента: «{rfq.notes}»
                      </p>
                    )}
                  </div>

                  {/* Quote form (only if not accepted/rejected) */}
                  {rfq.status !== 'accepted' && rfq.status !== 'rejected' && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">
                        {rfq.status === 'quoted' ? 'Обновить котировку' : 'Отправить котировку'}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={quotePrice[rfq.id] ?? (rfq.quote?.totalPrice ?? '')}
                          onChange={(e) => setQuotePrice((p) => ({ ...p, [rfq.id]: e.target.value }))}
                          className="rounded-lg border border-border bg-white dark:bg-gray-950 px-3 py-2 text-sm text-foreground"
                          placeholder="Сумма, €"
                        />
                        <input
                          type="number"
                          min={1}
                          value={quoteValidDays[rfq.id] ?? '7'}
                          onChange={(e) => setQuoteValidDays((p) => ({ ...p, [rfq.id]: e.target.value }))}
                          className="rounded-lg border border-border bg-white dark:bg-gray-950 px-3 py-2 text-sm text-foreground"
                          placeholder="Действует, дней"
                        />
                        <input
                          type="text"
                          value={quoteTerms[rfq.id] ?? (rfq.quote?.terms ?? '')}
                          onChange={(e) => setQuoteTerms((p) => ({ ...p, [rfq.id]: e.target.value }))}
                          className="rounded-lg border border-border bg-white dark:bg-gray-950 px-3 py-2 text-sm text-foreground"
                          placeholder="Условия оплаты/поставки"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button
                          size="sm"
                          onClick={() => sendQuote(rfq.id)}
                          disabled={!(parseFloat(quotePrice[rfq.id] ?? '') > 0) && !rfq.quote}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {rfq.status === 'quoted' ? 'Обновить котировку' : 'Отправить котировку'}
                        </Button>
                        {rfq.status === 'quoted' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatus(rfq.id, 'accepted')}
                              className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                            >
                              Отметить как принята
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatus(rfq.id, 'rejected')}
                              className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              Отметить как отклонена
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Add note */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                      Добавить заметку в историю
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={noteDraft[rfq.id] ?? ''}
                        onChange={(e) => setNoteDraft((p) => ({ ...p, [rfq.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && submitNote(rfq.id)}
                        placeholder="Внутренний комментарий..."
                        className="flex-1 rounded-lg border border-border bg-white dark:bg-gray-950 px-3 py-1.5 text-sm text-foreground"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => submitNote(rfq.id)}
                        disabled={!(noteDraft[rfq.id] ?? '').trim()}
                      >
                        Добавить
                      </Button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-4">
                      История событий
                    </p>
                    <Timeline events={rfq.timeline} />
                  </div>
                </div>
              )}
            </article>
          )
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-border p-10 bg-gray-50 dark:bg-gray-800 text-center text-sm text-muted-foreground">
            {requests.length === 0 ? 'RFQ заявок пока нет' : 'Нет заявок по выбранным фильтрам'}
          </div>
        )}
      </div>
    </main>
  )
}
