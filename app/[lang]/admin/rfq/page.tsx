'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { type Product } from '@/data/products'
import { useRFQStore, mapServerRfq, type RFQStatus, type RFQTimelineEvent } from '@/lib/rfq-store'
import { formatDate, formatEuro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/toast-context'
import { adminFetchJson, reportAdminError, reportAdminPartial } from '@/lib/admin-ui-errors'
import { fetchAllProducts } from '@/lib/client-products'
import { useAdminLocale } from '@/lib/use-admin-locale'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<RFQStatus, string> = {
  pending:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  quoted:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

const STATUS_CARD_BORDER: Record<RFQStatus, string> = {
  pending:  'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
  quoted:   'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
  accepted: 'border-l-green-500 bg-green-50 dark:bg-green-950/20',
  rejected: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
}

type TimelineEventType = RFQTimelineEvent['type']

const EVENT_DOT: Record<TimelineEventType, string> = {
  created:    'bg-gray-400 dark:bg-gray-500',
  quote_sent: 'bg-blue-500',
  accepted:   'bg-green-500',
  rejected:   'bg-red-400',
  note:       'bg-primary/60',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Timeline({ events }: { events: RFQTimelineEvent[] }) {
  const { locale, l } = useAdminLocale()
  const eventLabel = (type: TimelineEventType) => type === 'created' ? l('Заявка создана', 'Request created', 'Pieprasījums izveidots') : type === 'quote_sent' ? l('Котировка отправлена', 'Quote sent', 'Piedāvājums nosūtīts') : type === 'accepted' ? l('Принята клиентом', 'Accepted by customer', 'Klients pieņēma') : type === 'rejected' ? l('Отклонена', 'Rejected', 'Noraidīts') : l('Заметка', 'Note', 'Piezīme')
  if (!events.length) return null
  const sorted = [...events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-muted" />

      <div className="space-y-4">
        {sorted.map((ev, i) => (
          <div key={i} className="relative flex items-start gap-3">
            {/* Dot */}
            <span className={`absolute -left-6 mt-1 h-[10px] w-[10px] rounded-full border-2 border-white dark:border-gray-900 ${EVENT_DOT[ev.type]}`} />

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground">
                  {eventLabel(ev.type)}
                </p>
                <time className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {formatDate(ev.at, locale)}
                </time>
              </div>

              {ev.type === 'quote_sent' && ev.quotePrice !== undefined && (
                <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                  <p>{l('Сумма:', 'Total:', 'Summa:')} <span className="font-medium text-foreground">{formatEuro(ev.quotePrice, locale)}</span></p>
                  {ev.quoteTerms && <p>{l('Условия:', 'Terms:', 'Nosacījumi:')} {ev.quoteTerms}</p>}
                  {ev.quoteValidUntil && <p>{l('Действует до:', 'Valid until:', 'Derīgs līdz:')} {formatDate(ev.quoteValidUntil, locale)}</p>}
                </div>
              )}

              {ev.note && ev.type !== 'quote_sent' && (
                <p className="mt-0.5 text-xs text-muted-foreground italic">{ev.internal ? l('Внутренняя заметка: ', 'Internal note: ', 'Iekšēja piezīme: ') : ''}{ev.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminRFQPage(): React.ReactElement {
  const { locale, l } = useAdminLocale()
  const statusLabel = (status: RFQStatus) => status === 'pending' ? l('Новая', 'New', 'Jauns') : status === 'quoted' ? l('Котировка отправлена', 'Quote sent', 'Piedāvājums nosūtīts') : status === 'accepted' ? l('Принята', 'Accepted', 'Pieņemts') : l('Отклонена', 'Rejected', 'Noraidīts')
  const [loadedProducts, setLoadedProducts] = useState<Product[]>([])
  const [quotePrice, setQuotePrice] = useState<Record<string, string>>({})
  const [quoteTerms, setQuoteTerms] = useState<Record<string, string>>({})
  const [quoteValidDays, setQuoteValidDays] = useState<Record<string, string>>({})
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<RFQStatus | 'all'>('all')

  const { getAll, setQuote, addNote, setRequests } = useRFQStore()
  const requests = useMemo(() => getAll(), [getAll])
  const { showToast } = useToast()

  React.useEffect(() => {
    fetchAllProducts()
      .then(setLoadedProducts)
      .catch(() => { setLoadedProducts([]); reportAdminPartial(l('RFQ загружены, но названия и цены товаров недоступны.', 'RFQs loaded, but product names and prices are unavailable.', 'RFQ ielādēti, bet produktu nosaukumi un cenas nav pieejami.'), 'RFQ') })
  }, [l])

  React.useEffect(() => {
    const loadAll = async () => {
      const all: Array<ReturnType<typeof mapServerRfq>> = []
      let skip = 0
      for (;;) {
        const payload = await adminFetchJson<{ requests?: Array<Parameters<typeof mapServerRfq>[0]>; total?: number }>(`/api/rfq?skip=${skip}&take=200`)
        const page = Array.isArray(payload.requests) ? payload.requests.map(mapServerRfq) : []
        all.push(...page)
        if (page.length < 200 || all.length >= (payload.total ?? all.length)) return all
        skip += page.length
      }
    }
    loadAll()
      .then(setRequests)
      .catch((error) => reportAdminError(error, l('RFQ-заявки', 'RFQ requests', 'RFQ pieprasījumi')))
  }, [setRequests, l])

  const products = loadedProducts

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

  const sendQuote = async (rfqId: string) => {
    const current = requests.find((request) => request.id === rfqId)
    const price = parseFloat(quotePrice[rfqId] ?? String(current?.quote?.totalPrice ?? ''))
    const terms = (quoteTerms[rfqId] ?? current?.quote?.terms ?? '').trim()
    const days = parseInt(quoteValidDays[rfqId] ?? '7', 10)
    if (!price || price <= 0 || !terms) return
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + Math.min(365, Math.max(1, days || 7)))
    const ok = await setQuote(rfqId, { totalPrice: price, terms, validUntil })
    if (!ok) {
      showToast(l('Не удалось отправить котировку. Попробуйте ещё раз.', 'Failed to send the quote. Try again.', 'Neizdevās nosūtīt piedāvājumu. Mēģiniet vēlreiz.'), 'error')
      return
    }
    setQuotePrice((p) => { const n = { ...p }; delete n[rfqId]; return n })
    setQuoteTerms((p) => { const n = { ...p }; delete n[rfqId]; return n })
    setQuoteValidDays((p) => { const n = { ...p }; delete n[rfqId]; return n })
  }

  const submitNote = async (rfqId: string) => {
    const note = (noteDraft[rfqId] ?? '').trim()
    if (!note) return
    const ok = await addNote(rfqId, note)
    if (!ok) {
      showToast(l('Не удалось сохранить заметку. Попробуйте ещё раз.', 'Failed to save the note. Try again.', 'Neizdevās saglabāt piezīmi. Mēģiniet vēlreiz.'), 'error')
      return
    }
    setNoteDraft((p) => { const n = { ...p }; delete n[rfqId]; return n })
  }

  const STATUS_TABS: { value: RFQStatus | 'all'; label: string }[] = [
    { value: 'all',      label: `${l('Все', 'All', 'Visi')} (${counts.all})` },
    { value: 'pending',  label: `${l('Новые', 'New', 'Jauni')} (${counts.pending})` },
    { value: 'quoted',   label: `${l('Котировки', 'Quotes', 'Piedāvājumi')} (${counts.quoted})` },
    { value: 'accepted', label: `${l('Принятые', 'Accepted', 'Pieņemtie')} (${counts.accepted})` },
    { value: 'rejected', label: `${l('Отклонённые', 'Rejected', 'Noraidītie')} (${counts.rejected})` },
  ]

  return (
    <main className="w-full py-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{l('RFQ-заявки', 'RFQ requests', 'RFQ pieprasījumi')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {l('Запросы на котировку от B2B-клиентов', 'Quote requests from B2B customers', 'B2B klientu cenu piedāvājumu pieprasījumi')}
          </p>
        </div>
        <Link href="/admin"><Button variant="outline">← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Button></Link>
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
                ? 'bg-primary border-primary text-primary-foreground'
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
                'overflow-hidden rounded-xl border border-l-4 border-border shadow-sm transition-colors',
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
                    <span className="font-mono text-xs text-muted-foreground">{rfq.id}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[rfq.status]}`}>
                      {statusLabel(rfq.status)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {l('Компания:', 'Company:', 'Uzņēmums:')} <span className="font-medium">{rfq.companyName ?? rfq.companyId}</span>
                  </p>
                  {(rfq.contactEmail || rfq.contactPhone) && (
                    <p className="text-xs text-muted-foreground">{[rfq.contactEmail, rfq.contactPhone].filter(Boolean).join(' · ')}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {l('Создана:', 'Created:', 'Izveidots:')} {formatDate(rfq.createdAt, locale)}
                    {rfq.timeline.length > 1 && lastEvent && (
                      <> · {l('Последнее обновление:', 'Last updated:', 'Pēdējās izmaiņas:')} {formatDate(lastEvent.at, locale)}</>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {rfq.items.length} {l('позиций', 'items', 'pozīcijas')}
                  </p>
                  {rfq.quote && (
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatEuro(rfq.quote.totalPrice, locale)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{isExpanded ? '▲' : '▼'}</p>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-border px-5 py-5 space-y-6">

                  {/* Items */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{l('Состав заявки', 'Request items', 'Pieprasījuma saturs')}</p>
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {rfq.items.map((item, idx) => {
                        const product = products.find((p) => p.id === item.productId)
                        return (
                          <div key={idx} className="flex items-center justify-between px-3 py-2.5 gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-foreground truncate">
                                {item.title ?? product?.title ?? item.productId}
                              </p>
                              {(item.sku ?? product?.sku) && (
                                <p className="text-xs text-muted-foreground font-mono">{item.sku ?? product?.sku}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm text-muted-foreground">{item.quantity} {l('шт.', 'pcs', 'gab.')}</p>
                              {(item.listPrice ?? product?.price) !== undefined && (
                                <p className="text-xs text-muted-foreground">
                                  {l('Цена на момент запроса:', 'Price at request time:', 'Cena pieprasījuma brīdī:')} {formatEuro((item.listPrice ?? product?.price ?? 0) * item.quantity, locale)}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {rfq.notes && (
                      <p className="mt-2 text-sm text-muted-foreground italic">
                        {l('Комментарий клиента:', 'Customer comment:', 'Klienta komentārs:')} «{rfq.notes}»
                      </p>
                    )}
                  </div>

                  {/* Quote form (only if not accepted/rejected) */}
                  {rfq.status !== 'accepted' && rfq.status !== 'rejected' && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        {rfq.status === 'quoted' ? l('Обновить котировку', 'Update quote', 'Atjaunināt piedāvājumu') : l('Отправить котировку', 'Send quote', 'Nosūtīt piedāvājumu')}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={quotePrice[rfq.id] ?? (rfq.quote?.totalPrice ?? '')}
                          onChange={(e) => setQuotePrice((p) => ({ ...p, [rfq.id]: e.target.value }))}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                          placeholder={l('Сумма, €', 'Total, €', 'Summa, €')}
                        />
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={quoteValidDays[rfq.id] ?? '7'}
                          onChange={(e) => setQuoteValidDays((p) => ({ ...p, [rfq.id]: e.target.value }))}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                          placeholder={l('Действует, дней', 'Valid for, days', 'Derīgs, dienas')}
                        />
                        <Input
                          type="text"
                          value={quoteTerms[rfq.id] ?? (rfq.quote?.terms ?? '')}
                          onChange={(e) => setQuoteTerms((p) => ({ ...p, [rfq.id]: e.target.value }))}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                          placeholder={l('Условия оплаты/поставки', 'Payment/delivery terms', 'Apmaksas/piegādes nosacījumi')}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button
                          size="sm"
                          onClick={() => sendQuote(rfq.id)}
                          disabled={!(parseFloat(quotePrice[rfq.id] ?? '') > 0) && !rfq.quote}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {rfq.status === 'quoted' ? l('Обновить котировку', 'Update quote', 'Atjaunināt piedāvājumu') : l('Отправить котировку', 'Send quote', 'Nosūtīt piedāvājumu')}
                        </Button>
                        {rfq.status === 'quoted' && <p className="self-center text-xs text-muted-foreground">{l('Ожидается решение клиента', 'Waiting for the customer’s decision', 'Gaida klienta lēmumu')}</p>}
                      </div>
                    </div>
                  )}

                  {/* Add note */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {l('Добавить заметку в историю', 'Add note to history', 'Pievienot piezīmi vēsturei')}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={noteDraft[rfq.id] ?? ''}
                        onChange={(e) => setNoteDraft((p) => ({ ...p, [rfq.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && submitNote(rfq.id)}
                        placeholder={l('Внутренний комментарий...', 'Internal comment...', 'Iekšējs komentārs...')}
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => submitNote(rfq.id)}
                        disabled={!(noteDraft[rfq.id] ?? '').trim()}
                      >
                        {l('Добавить', 'Add', 'Pievienot')}
                      </Button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                      {l('История событий', 'Event history', 'Notikumu vēsture')}
                    </p>
                    <Timeline events={rfq.timeline} />
                  </div>
                </div>
              )}
            </article>
          )
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-border p-10 bg-muted text-center text-sm text-muted-foreground">
            {requests.length === 0 ? l('RFQ-заявок пока нет', 'There are no RFQ requests yet', 'RFQ pieprasījumu vēl nav') : l('Нет заявок по выбранным фильтрам', 'No requests match the selected filters', 'Atlasītajiem filtriem neatbilst neviens pieprasījums')}
          </div>
        )}
      </div>
    </main>
  )
}
