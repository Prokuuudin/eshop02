'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAdminLogStore, mapServerLogEntry, getAdminActionLabels, type AdminLogAction } from '@/lib/admin-log-store'
import { adminFetchJson, classifyAdminError } from '@/lib/admin-ui-errors'
import { useAdminLocale } from '@/lib/use-admin-locale'
import StickyTableHead from '@/components/admin/StickyTableHead'

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_BADGE: Record<string, string> = {
  'order':   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  'product': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  'promo':   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
  'return':  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  'rfq':     'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary/60',
  'review':  'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200',
}

function actionBadgeCls(action: string): string {
  const prefix = action.split('.')[0] ?? ''
  return ACTION_BADGE[prefix] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
}

function fmtDate(d: Date | string, locale: string): string {
  return new Date(d).toLocaleString(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const PAGE_SIZE = 50
const API_PAGE_SIZE = 200

type IntegrityResult = { valid: boolean; checked: number; invalidId?: string }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminLogPage(): React.ReactElement {
  const { l, locale, language } = useAdminLocale()
  const actionLabels = getAdminActionLabels(language)
  const [now] = useState(Date.now)
  const entries = useAdminLogStore((s) => s.entries)
  const setEntries = useAdminLogStore((s) => s.setEntries)
  // Audit log is append-only by design (tamper-evident hash chain, see
  // /api/admin/audit-log) - there is no real delete endpoint. This only hides
  // old rows from the current view; it never touches the underlying log.
  const [hideOlderThan90, setHideOlderThan90] = useState(false)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null)
  const [integrityError, setIntegrityError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const loadAllEntries = async (): Promise<void> => {
      const all: Array<Parameters<typeof mapServerLogEntry>[0]> = []
      let total = 0
      do {
        const payload = await adminFetchJson<{
          entries?: Array<Parameters<typeof mapServerLogEntry>[0]>
          total?: number
        }>(`/api/admin/audit-log?skip=${all.length}&take=${API_PAGE_SIZE}`, { signal: controller.signal })
        const batch = Array.isArray(payload.entries) ? payload.entries : []
        all.push(...batch)
        total = typeof payload.total === 'number' ? payload.total : all.length
        if (batch.length === 0) break
      } while (all.length < total)
      setEntries(all.map(mapServerLogEntry))
    }

    void Promise.all([
      loadAllEntries().then(() => setLoadState('ready')),
      adminFetchJson<IntegrityResult>('/api/admin/audit-log/verify', { signal: controller.signal })
        .then((result) => { setIntegrity(result); setIntegrityError(false) })
        .catch(() => setIntegrityError(true)),
    ]).catch((error) => {
      if (controller.signal.aborted) return
      setLoadError(classifyAdminError(error, l('Журнал аудита', 'Audit log', 'Audita žurnāls')).message)
      setLoadState('error')
    })
    return () => controller.abort()
  }, [l, setEntries])

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<AdminLogAction | ''>('')
  const [adminFilter, setAdminFilter] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [entries]
  )

  const uniqueActions = useMemo(
    () => Array.from(new Set(sorted.map((e) => e.action))).sort(),
    [sorted]
  )

  const uniqueAdmins = useMemo(
    () => Array.from(new Set(sorted.map((e) => e.adminEmail))).sort(),
    [sorted]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const cutoff = now - 90 * 86400_000
    return sorted.filter((e) => {
      if (hideOlderThan90 && new Date(e.at).getTime() < cutoff) return false
      if (actionFilter && e.action !== actionFilter) return false
      if (adminFilter && e.adminEmail !== adminFilter) return false
      if (q) {
        const hay = `${e.adminEmail} ${e.entityId} ${e.entityTitle ?? ''} ${e.details ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [sorted, actionFilter, adminFilter, search, hideOlderThan90, now])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Stats
  const stats = useMemo(() => {
    return {
      total: entries.length,
      today: entries.filter((e) => now - new Date(e.at).getTime() < 86400_000).length,
      week:  entries.filter((e) => now - new Date(e.at).getTime() < 7 * 86400_000).length,
    }
  }, [entries, now])

  const downloadCSV = () => {
    const header = [l('Дата', 'Date', 'Datums'), l('Администратор', 'Administrator', 'Administrators'), 'Email', l('Действие', 'Action', 'Darbība'), l('Тип', 'Type', 'Tips'), 'ID', l('Объект', 'Object', 'Objekts'), l('До', 'Before', 'Pirms'), l('После', 'After', 'Pēc'), l('Детали', 'Details', 'Informācija')]
    const rows = filtered.map((e) => [
      fmtDate(e.at, locale),
      e.adminName ?? '',
      e.adminEmail,
      actionLabels[e.action as AdminLogAction] ?? e.action,
      e.entityType,
      e.entityId,
      e.entityTitle ?? '',
      e.before ? JSON.stringify(e.before) : '',
      e.after ? JSON.stringify(e.after) : '',
      e.details ?? '',
    ])
    const content = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `admin-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminGate access="full">
      <main className="w-full py-4 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{l('Лог действий администраторов', 'Administrator activity log', 'Administratoru darbību žurnāls')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {l('Кто, когда и что изменил в системе', 'Who changed what in the system and when', 'Kas, kad un ko mainīja sistēmā')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadCSV}>{l('Экспорт CSV', 'Export CSV', 'Eksportēt CSV')}</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setHideOlderThan90((v) => !v); setPage(0) }}
              title={l('Скрывает записи только в этом просмотре — журнал аудита неизменяем и не удаляется', 'Hides entries in this view only; the audit log is immutable and is not deleted', 'Paslēpj ierakstus tikai šajā skatā; audita žurnāls ir nemainīgs un netiek dzēsts')}
            >
              {hideOlderThan90 ? l('Показать все записи', 'Show all entries', 'Rādīt visus ierakstus') : l('Скрыть старше 90 дней', 'Hide entries older than 90 days', 'Slēpt ierakstus, kas vecāki par 90 dienām')}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/system/logs">← {l('Системные логи', 'System logs', 'Sistēmas žurnāli')}</Link>
            </Button>
          </div>
        </div>

        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            integrity?.valid
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
          }`}
        >
          {integrity?.valid
            ? l(
                `Целостность подтверждена: проверено записей — ${integrity.checked}.`,
                `Integrity verified: ${integrity.checked} entries checked.`,
                `Integritāte apstiprināta: pārbaudīti ${integrity.checked} ieraksti.`,
              )
            : integrityError
              ? l('Не удалось проверить целостность журнала.', 'Audit-log integrity could not be checked.', 'Neizdevās pārbaudīt audita žurnāla integritāti.')
              : l('Проверка целостности журнала…', 'Checking audit-log integrity…', 'Pārbauda audita žurnāla integritāti…')}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: l('Всего событий', 'Total events', 'Notikumi kopā'), value: stats.total },
            { label: l('За последние 24 ч', 'Last 24 hours', 'Pēdējās 24 stundās'), value: stats.today, cls: 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800' },
            { label: l('За 7 дней', 'Last 7 days', 'Pēdējās 7 dienās'), value: stats.week, cls: 'bg-primary/5 border-primary/30 dark:bg-primary/20/10 dark:border-primary/40' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls ?? 'border-border bg-card'}`}>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder={l('Поиск по объекту, email, деталям...', 'Search by object, email or details...', 'Meklēt pēc objekta, e-pasta vai informācijas...')}
            className="w-64"
          />
          <Select value={actionFilter || 'all'} onValueChange={(v) => { setActionFilter(v === 'all' ? '' : v as AdminLogAction); setPage(0) }}>
            <SelectTrigger className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{l('Все действия', 'All actions', 'Visas darbības')}</SelectItem>
              {uniqueActions.map((a) => (
                <SelectItem key={a} value={a}>{actionLabels[a as AdminLogAction] ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={adminFilter || 'all'} onValueChange={(v) => { setAdminFilter(v === 'all' ? '' : v); setPage(0) }}>
            <SelectTrigger className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{l('Все администраторы', 'All administrators', 'Visi administratori')}</SelectItem>
              {uniqueAdmins.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="self-center text-sm text-muted-foreground ml-auto">
            {filtered.length} {l('из', 'of', 'no')} {entries.length}
          </span>
        </div>

        {/* Table */}
        {loadState === 'loading' ? (
          <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground">{l('Загрузка журнала…', 'Loading audit log…', 'Audita žurnāla ielāde…')}</div>
        ) : loadState === 'error' ? (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 py-10 text-center text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{loadError}</div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground">
            {l('Действия пока не зарегистрированы. Лог наполнится после первых операций в админке.', 'No actions have been recorded yet. The log will populate after the first admin operations.', 'Darbības vēl nav reģistrētas. Žurnāls tiks aizpildīts pēc pirmajām darbībām administrācijas panelī.')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border py-10 text-center text-sm text-muted-foreground">
            {l('Нет событий по заданным фильтрам', 'No events match the selected filters', 'Neviens notikums neatbilst izvēlētajiem filtriem')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border lg:overflow-visible">
              <table className="min-w-full text-sm bg-card">
                <StickyTableHead>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{l('Время', 'Time', 'Laiks')}</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">{l('Кто', 'Who', 'Kas')}</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">{l('Действие', 'Action', 'Darbība')}</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">{l('Объект', 'Object', 'Objekts')}</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">{l('До → После', 'Before → After', 'Pirms → Pēc')}</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">{l('Детали', 'Details', 'Informācija')}</th>
                  </tr>
                </StickyTableHead>
                <tbody className="divide-y divide-border">
                  {pageItems.map((entry) => (
                    <Fragment key={entry.id}>
                      <tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setExpandedId(expandedId === entry.id ? null : entry.id)
                          }
                        }}
                        tabIndex={0}
                        aria-expanded={expandedId === entry.id}
                        aria-label={l(`Подробнее: ${entry.entityTitle ?? entry.entityId}`, `Details: ${entry.entityTitle ?? entry.entityId}`, `Informācija: ${entry.entityTitle ?? entry.entityId}`)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {fmtDate(entry.at, locale)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-foreground">{entry.adminName ?? entry.adminEmail}</p>
                          {entry.adminName && <p className="text-xs text-muted-foreground">{entry.adminEmail}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${actionBadgeCls(entry.action)}`}>
                            {actionLabels[entry.action as AdminLogAction] ?? entry.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-foreground truncate max-w-[180px]">{entry.entityTitle ?? entry.entityId}</p>
                          <p className="text-xs text-muted-foreground font-mono">{entry.entityType}:{entry.entityId.slice(0, 12)}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {(entry.before || entry.after) ? (
                            <span className="font-mono">
                              {entry.before ? JSON.stringify(entry.before) : '—'}
                              {' → '}
                              {entry.after ? JSON.stringify(entry.after) : '—'}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                          {entry.details ?? '—'}
                        </td>
                      </tr>
                      {expandedId === entry.id && (
                        <tr className="bg-muted/30">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                              <div>
                                <p className="font-semibold text-muted-foreground mb-1">{l('ID события', 'Event ID', 'Notikuma ID')}</p>
                                <code className="font-mono text-foreground">{entry.id}</code>
                              </div>
                              <div>
                                <p className="font-semibold text-muted-foreground mb-1">{l('Тип / ID объекта', 'Object type / ID', 'Objekta tips / ID')}</p>
                                <code className="font-mono text-foreground">{entry.entityType} / {entry.entityId}</code>
                              </div>
                              {entry.before && (
                                <div>
                                  <p className="font-semibold text-muted-foreground mb-1">{l('До', 'Before', 'Pirms')}</p>
                                  <pre className="bg-red-50 dark:bg-red-900/10 rounded p-2 overflow-x-auto text-red-700 dark:text-red-300">
                                    {JSON.stringify(entry.before, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {entry.after && (
                                <div>
                                  <p className="font-semibold text-muted-foreground mb-1">{l('После', 'After', 'Pēc')}</p>
                                  <pre className="bg-green-50 dark:bg-green-900/10 rounded p-2 overflow-x-auto text-green-700 dark:text-green-300">
                                    {JSON.stringify(entry.after, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {entry.details && (
                                <div className="md:col-span-2">
                                  <p className="font-semibold text-muted-foreground mb-1">{l('Детали', 'Details', 'Informācija')}</p>
                                  <p className="text-foreground">{entry.details}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  {l('Стр.', 'Page', 'Lapa')} {page + 1} {l('из', 'of', 'no')} {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setPage(0)} disabled={page === 0}>«</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>‹</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}>›</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </AdminGate>
  )
}
