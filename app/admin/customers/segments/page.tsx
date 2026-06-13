'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import type { CustomerRow as ApiCustomerRow } from '@/app/api/admin/customers/route'

type Segment = 'VIP' | 'Постоянный' | 'Новый' | 'Неактивный'

interface CustomerRow extends ApiCustomerRow {
  lastOrderDate: string | null
  segment: Segment
}

function getSegment(totalOrders: number, totalSpent: number, lastOrderDate: string | null): Segment {
  const now = new Date()
  const daysSinceLast = lastOrderDate
    ? (now.getTime() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity

  if (totalSpent > 500) return 'VIP'
  if (totalOrders > 3) return 'Постоянный'
  if (daysSinceLast > 180 || totalOrders === 0) return 'Неактивный'
  return 'Новый'
}

const SEGMENT_COLORS: Record<Segment, string> = {
  VIP:         'bg-yellow-100 text-yellow-800 border border-yellow-300',
  Постоянный:  'bg-blue-100 text-blue-800 border border-blue-300',
  Новый:       'bg-green-100 text-green-800 border border-green-300',
  Неактивный:  'bg-gray-100 text-gray-600 border border-gray-300',
}

const SEGMENT_CARD_COLORS: Record<Segment, string> = {
  VIP:         'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800',
  Постоянный:  'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800',
  Новый:       'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800',
  Неактивный:  'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700',
}

type FilterTab = 'Все' | Segment

type BroadcastResult = { sent: number; failed: number; failedEmails: string[] }

const SEGMENT_DESCRIPTIONS: Record<Segment, string> = {
  VIP:        'потратили более €500',
  Постоянный: 'более 3 заказов',
  Новый:      'до 3 заказов, активные',
  Неактивный: 'не покупали более 180 дней',
}

function renderPreview(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

const SAMPLE_VARS = { first_name: 'Иван', last_name: 'Петров', email: 'ivan@example.com' }

const UNSUBSCRIBE_TEXT =
  'Чтобы отписаться от рассылки, ответьте на это письмо с пометкой «Отписаться». / To unsubscribe, reply to this email with "Unsubscribe". / Lai atteiktos no jaunumiem, atbildiet uz šo e-pastu ar norādi "Atteikt".'

export default function AdminCustomerSegmentsPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<FilterTab>('Все')
  const [search, setSearch] = useState('')

  // Broadcast state
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [bSubject, setBSubject] = useState('')
  const [bBody, setBBody] = useState('')
  const [bTab, setBTab] = useState<'edit' | 'preview'>('edit')
  const [bSending, setBSending] = useState(false)
  const [bResult, setBResult] = useState<BroadcastResult | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFetchError(null)

    fetch('/api/admin/customers')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { customers: ApiCustomerRow[]; total: number }
        if (cancelled) return
        const rows: CustomerRow[] = data.customers.map((c) => ({
          ...c,
          segment: getSegment(c.totalOrders, c.totalSpent, c.lastOrderDate),
        }))
        setCustomers(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFetchError(err instanceof Error ? err.message : 'Ошибка загрузки')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const counts = useMemo(() => {
    const result: Record<Segment, number> = { VIP: 0, Постоянный: 0, Новый: 0, Неактивный: 0 }
    for (const c of customers) result[c.segment]++
    return result
  }, [customers])

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (activeTab !== 'Все' && c.segment !== activeTab) return false
      if (search && !c.email.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [customers, activeTab, search])

  // Recipients for broadcast = current filter, no search constraint
  const broadcastRecipients = useMemo(() => {
    if (activeTab === 'Все') return customers
    return customers.filter((c) => c.segment === activeTab)
  }, [customers, activeTab])

  const tabs: FilterTab[] = ['Все', 'VIP', 'Постоянный', 'Новый', 'Неактивный']

  const sendBroadcast = async () => {
    if (!bSubject.trim() || !bBody.trim()) return

    setBSending(true)
    setBResult(null)
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: broadcastRecipients.map((c) => ({
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
          })),
          subject: bSubject,
          body: bBody,
        }),
      })
      const data = (await res.json()) as BroadcastResult
      setBResult(data)
    } catch {
      setBResult({ sent: 0, failed: broadcastRecipients.length, failedEmails: [] })
    } finally {
      setBSending(false)
    }
  }

  const sendButtonLabel = bSending
    ? `Отправка (${broadcastRecipients.length} писем)...`
    : `Отправить ${broadcastRecipients.length} письм${broadcastRecipients.length === 1 ? 'о' : broadcastRecipients.length < 5 ? 'а' : ''}`

  const canSend = !bSending && !!bSubject.trim() && !!bBody.trim() && broadcastRecipients.length > 0

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Сегменты и статусы клиентов</h1>
          <Button variant="outline" asChild>
            <Link href="/admin">← Назад в админку</Link>
          </Button>
        </div>

        {/* Loading / error states */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border p-4 bg-gray-50 dark:bg-gray-800 animate-pulse">
                <div className="h-8 w-12 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            ))}
          </div>
        )}

        {!loading && fetchError && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-400">Ошибка загрузки данных: {fetchError}</p>
          </div>
        )}

        {!loading && !fetchError && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(['VIP', 'Постоянный', 'Новый', 'Неактивный'] as Segment[]).map((seg) => (
                <div key={seg} className={`rounded-lg border p-4 ${SEGMENT_CARD_COLORS[seg]}`}>
                  <div className="text-2xl font-bold text-foreground">{counts[seg]}</div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">{seg}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{SEGMENT_DESCRIPTIONS[seg]}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-1 flex-wrap">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setBResult(null) }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      activeTab === tab
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card text-gray-700 dark:text-gray-300 border-border hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {tab}
                    {tab !== 'Все' && <span className="ml-1 opacity-70">({counts[tab as Segment]})</span>}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Поиск по email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {/* Broadcast panel */}
            {customers.length > 0 && (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-card">
                <button
                  type="button"
                  onClick={() => { setShowBroadcast((v) => !v); setBResult(null) }}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-indigo-700 dark:text-primary">
                      Рассылка по сегменту
                    </span>
                    <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-primary">
                      {broadcastRecipients.length} получателей
                      {activeTab !== 'Все' && ` · ${activeTab}`}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs">{showBroadcast ? '▲ Свернуть' : '▼ Развернуть'}</span>
                </button>

                {showBroadcast && (
                  <div className="border-t border-indigo-100 dark:border-indigo-800 px-5 py-4 space-y-4">

                    {/* Recipients info */}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>
                        Получатели: <strong className="text-foreground">{broadcastRecipients.length}</strong>
                        {activeTab !== 'Все' && ` клиентов сегмента «${activeTab}»`}
                        {activeTab === 'Все' && ' (все клиенты)'}
                      </span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <span>Переменные: <code className="bg-muted px-1 rounded">{'{first_name}'}</code> <code className="bg-muted px-1 rounded">{'{last_name}'}</code> <code className="bg-muted px-1 rounded">{'{email}'}</code></span>
                    </div>

                    {/* Subject */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Тема письма</label>
                      <Input
                        value={bSubject}
                        onChange={(e) => setBSubject(e.target.value)}
                        placeholder="Например: Привет, {first_name}! Специальное предложение для вас"
                      />
                    </div>

                    {/* Body with edit/preview tabs */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-muted-foreground">Текст письма</label>
                        <div className="flex rounded-md border border-border overflow-hidden text-xs">
                          {(['edit', 'preview'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setBTab(t)}
                              className={`px-3 py-1 transition-colors ${bTab === t ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                            >
                              {t === 'edit' ? 'Редактор' : 'Превью'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {bTab === 'edit' ? (
                        <textarea
                          rows={7}
                          value={bBody}
                          onChange={(e) => setBBody(e.target.value)}
                          placeholder={'Здравствуйте, {first_name}!\n\nПишем вам по поводу...'}
                          className="w-full rounded-lg border border-border bg-white dark:bg-gray-800 px-3 py-2 text-sm text-foreground placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      ) : (
                        <div className="rounded-lg border border-border bg-gray-50 dark:bg-gray-800 p-4 min-h-[176px]">
                          {bBody ? (
                            <div className="space-y-1">
                              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                                Тема: <span className="text-gray-700 dark:text-gray-300">{renderPreview(bSubject, SAMPLE_VARS) || '—'}</span>
                              </p>
                              <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                                {renderPreview(bBody, SAMPLE_VARS)}
                              </div>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 pt-3 border-t border-border">
                                {UNSUBSCRIBE_TEXT}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 dark:text-gray-500">Введите текст письма в редакторе</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Send button + confirm dialog + result */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <ConfirmActionDialog
                        title="Подтвердите рассылку"
                        description={`Отправить письмо ${broadcastRecipients.length} получателям${activeTab !== 'Все' ? ` (${activeTab})` : ''}? Это действие нельзя отменить.`}
                        confirmLabel="Отправить"
                        cancelLabel="Отмена"
                        onConfirm={() => void sendBroadcast()}
                        trigger={
                          <Button
                            disabled={!canSend}
                            className="bg-primary hover:bg-primary/90 text-white"
                          >
                            {sendButtonLabel}
                          </Button>
                        }
                      />
                      {!bSubject.trim() || !bBody.trim() ? (
                        <span className="text-xs text-gray-400">Заполните тему и текст</span>
                      ) : null}
                    </div>

                    {/* Result */}
                    {bResult && (
                      <div className={`rounded-lg border px-4 py-3 ${bResult.failed === 0 ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
                        <p className="text-sm font-medium text-foreground">
                          Рассылка завершена: <span className="text-green-700 dark:text-green-400">{bResult.sent} отправлено</span>
                          {bResult.failed > 0 && <span className="text-red-600 dark:text-red-400"> · {bResult.failed} ошибок</span>}
                        </p>
                        {bResult.failedEmails.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Не доставлено: {bResult.failedEmails.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Table */}
            {customers.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 border rounded-lg">
                Нет данных о заказах. Клиенты появятся после первых заказов.
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 border rounded-lg">
                Клиенты не найдены по заданным фильтрам.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Имя</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Заказов</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Потрачено</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Последний заказ</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Сегмент</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filtered.map((c) => (
                      <tr key={c.email} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-foreground">
                          <Link
                            href={`/admin/customers/profile?email=${encodeURIComponent(c.email)}`}
                            className="hover:text-primary dark:hover:text-indigo-400 hover:underline"
                          >
                            {c.email}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-foreground">{c.firstName} {c.lastName}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{c.totalOrders}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">€{c.totalSpent.toFixed(2)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.lastOrderDate
                            ? new Date(c.lastOrderDate).toLocaleDateString('ru-RU')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEGMENT_COLORS[c.segment]}`}>
                            {c.segment}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/customers/profile?email=${encodeURIComponent(c.email)}`}
                            className="text-xs text-primary hover:underline whitespace-nowrap"
                          >
                            Профиль →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </AdminGate>
  )
}
