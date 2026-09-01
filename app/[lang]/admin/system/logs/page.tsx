'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminFetchJson, classifyAdminError } from '@/lib/admin-ui-errors'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { useAdminLocale } from '@/lib/use-admin-locale'
import StickyTableHead from '@/components/admin/StickyTableHead'

type ActivityEntry = {
  id: string
  companyId: string
  userId: string
  userName: string | null
  userEmail: string | null
  action: string
  details: unknown
  timestamp: string
}

function getActionBadgeClass(action: string): string {
  if (action.startsWith('order_')) return 'bg-blue-100 text-blue-800 border-blue-200'
  if (action.startsWith('user_') || action.startsWith('team_')) return 'bg-green-100 text-green-800 border-green-200'
  if (action.startsWith('api_')) return 'bg-orange-100 text-orange-800 border-orange-200'
  if (action.startsWith('payment_') || action.startsWith('invoice_')) return 'bg-purple-100 text-purple-800 border-purple-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

const PAGE_SIZE = 50

export default function AdminSystemLogsPage(): React.ReactElement {
  const { l, locale } = useAdminLocale()
  const confirmAction = useAdminConfirm()
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')

  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    adminFetchJson<{ entries: ActivityEntry[] }>('/api/admin/company-activity-log?take=500')
      .then(({ entries }) => { setEntries(entries); setLoadState('ready') })
      .catch((error) => { setLoadError(classifyAdminError(error, l('Системные логи', 'System logs', 'Sistēmas žurnāli')).message); setLoadState('error') })
  }, [l])

  async function reload() {
    setLoadState('loading')
    try {
      const { entries } = await adminFetchJson<{ entries: ActivityEntry[] }>('/api/admin/company-activity-log?take=500')
      setEntries(entries)
      setLoadState('ready')
    } catch (error) {
      setLoadError(classifyAdminError(error, l('Системные логи', 'System logs', 'Sistēmas žurnāli')).message)
      setLoadState('error')
    }
  }

  const all = useMemo(
    () =>
      [...entries].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [entries]
  )

  const uniqueActions = useMemo(() => {
    const set = new Set(all.map((e) => e.action))
    return Array.from(set).sort()
  }, [all])

  const [now] = useState(Date.now)
  const stats = useMemo(() => {
    const last24h = all.filter((e) => now - new Date(e.timestamp).getTime() < 86400_000).length
    const last7d = all.filter((e) => now - new Date(e.timestamp).getTime() < 7 * 86400_000).length
    return { total: all.length, last24h, last7d }
  }, [all, now])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all.filter((e) => {
      if (actionFilter && e.action !== actionFilter) return false
      if (q) {
        const detailsStr = JSON.stringify(e.details).toLowerCase()
        if (!e.userId?.toLowerCase().includes(q) && !detailsStr.includes(q)) return false
      }
      return true
    })
  }, [all, actionFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleExport() {
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportCSV() {
    const header = [l('Дата и время', 'Date and time', 'Datums un laiks'), l('Действие', 'Action', 'Darbība'), 'userId', 'companyId', l('Детали', 'Details', 'Informācija')]
    const rows = filtered.map((e) => [
      new Date(e.timestamp).toLocaleString(locale),
      e.action,
      e.userId ?? '',
      e.companyId ?? '',
      JSON.stringify(e.details),
    ])
    const content = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleClear() {
    const decision = await confirmAction({ title: l('Удалить старые системные логи?', 'Delete old system logs?', 'Dzēst vecos sistēmas žurnālus?'), description: l('Все записи старше 90 дней будут удалены. Новые записи останутся доступны.', 'All entries older than 90 days will be deleted. Newer entries will remain available.', 'Visi ieraksti, kas vecāki par 90 dienām, tiks dzēsti. Jaunākie ieraksti paliks pieejami.'), affected: [l('Системные логи старше 90 дней', 'System logs older than 90 days', 'Sistēmas žurnāli, kas vecāki par 90 dienām')], confirmText: l('УДАЛИТЬ', 'DELETE', 'DZĒST'), requireReason: true, destructive: true })
    if (!decision.confirmed) return
    try {
      await adminFetchJson('/api/admin/company-activity-log?olderThanDays=90', { method: 'DELETE' })
      await reload()
    } catch (error) {
      setLoadError(classifyAdminError(error, l('Удаление логов', 'Deleting logs', 'Žurnālu dzēšana')).message)
      setLoadState('error')
    }
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">{l('Логи и события системы', 'System logs and events', 'Sistēmas žurnāli un notikumi')}</h1>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              {l('Экспорт CSV', 'Export CSV', 'Eksportēt CSV')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              {l('Экспорт JSON', 'Export JSON', 'Eksportēt JSON')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClear}>
              {l('Очистить логи старше 90 дней', 'Delete logs older than 90 days', 'Dzēst žurnālus, kas vecāki par 90 dienām')}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin">← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground mt-1">{l('Всего событий', 'Total events', 'Notikumi kopā')}</div>
          </div>
          <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{stats.last24h}</div>
            <div className="text-sm text-muted-foreground mt-1">{l('За последние 24 ч', 'Last 24 hours', 'Pēdējās 24 stundās')}</div>
          </div>
          <div className="border rounded-lg p-4 bg-primary/5 border-primary/30">
            <div className="text-2xl font-bold text-primary">{stats.last7d}</div>
            <div className="text-sm text-muted-foreground mt-1">{l('За 7 дней', 'Last 7 days', 'Pēdējās 7 dienās')}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={actionFilter || 'all'} onValueChange={(v) => { setActionFilter(v === 'all' ? '' : v); setPage(0) }}>
            <SelectTrigger className="border rounded-md px-3 py-2 text-sm bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{l('Все действия', 'All actions', 'Visas darbības')}</SelectItem>
              {uniqueActions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={l('Поиск по userId или details…', 'Search by userId or details…', 'Meklēt pēc userId vai informācijas…')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="max-w-sm"
          />
        </div>

        {/* Table */}
        {loadState === 'loading' ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">{l('Загрузка…', 'Loading…', 'Ielāde…')}</div>
        ) : loadState === 'error' ? (
          <div role="alert" className="text-center py-16 border rounded-lg border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {loadError}
          </div>
        ) : all.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            {l('Системные логи пусты. События появятся после активности в системе.', 'System logs are empty. Events will appear after activity in the system.', 'Sistēmas žurnāli ir tukši. Notikumi parādīsies pēc darbībām sistēmā.')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            {l('Логи не найдены по заданным фильтрам.', 'No logs match the selected filters.', 'Neviens žurnāla ieraksts neatbilst izvēlētajiem filtriem.')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border lg:overflow-visible">
              <table className="min-w-full text-sm">
                <StickyTableHead>
                  <tr>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">{l('Дата и время', 'Timestamp', 'Datums un laiks')}</th>
                    <th className="text-left px-4 py-3 font-medium">{l('Действие', 'Action', 'Darbība')}</th>
                    <th className="text-left px-4 py-3 font-medium">userId</th>
                    <th className="text-left px-4 py-3 font-medium">companyId</th>
                    <th className="text-left px-4 py-3 font-medium">{l('Детали', 'Details', 'Informācija')}</th>
                  </tr>
                </StickyTableHead>
                <tbody className="divide-y">
                  {pageItems.map((entry) => (
                    <>
                      <tr key={entry.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                          {new Date(entry.timestamp).toLocaleString(locale, {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getActionBadgeClass(entry.action)}`}
                          >
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          {entry.userId}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          {entry.companyId}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              setExpandedId(expandedId === entry.id ? null : entry.id)
                            }
                            className="text-xs text-primary underline"
                          >
                            {expandedId === entry.id ? l('Свернуть', 'Collapse', 'Sakļaut') : 'JSON'}
                          </button>
                        </td>
                      </tr>
                      {expandedId === entry.id && (
                        <tr key={`${entry.id}-details`} className="bg-muted/20">
                          <td colSpan={5} className="px-4 py-3">
                            <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all bg-muted rounded p-2">
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                {l('Записей:', 'Entries:', 'Ieraksti:')} {filtered.length} | {l('Стр.', 'Page', 'Lapa')} {page + 1} {l('из', 'of', 'no')} {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  ← {l('Назад', 'Back', 'Atpakaļ')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  {l('Вперёд', 'Next', 'Tālāk')} →
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </AdminGate>
  )
}
