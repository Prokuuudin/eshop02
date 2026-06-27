'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuditLogStore } from '@/lib/audit-log-store'

function getActionBadgeClass(action: string): string {
  if (action.startsWith('order_')) return 'bg-blue-100 text-blue-800 border-blue-200'
  if (action.startsWith('user_') || action.startsWith('team_')) return 'bg-green-100 text-green-800 border-green-200'
  if (action.startsWith('api_')) return 'bg-orange-100 text-orange-800 border-orange-200'
  if (action.startsWith('payment_') || action.startsWith('invoice_')) return 'bg-purple-100 text-purple-800 border-purple-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

const PAGE_SIZE = 50

export default function AdminSystemLogsPage() {
  const entriesMap = useAuditLogStore((s) => s.entries)
  const clearOldEntries = useAuditLogStore((s) => s.clearOldEntries)

  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const all = useMemo(
    () =>
      Array.from(entriesMap.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [entriesMap]
  )

  const uniqueActions = useMemo(() => {
    const set = new Set(all.map((e) => e.action))
    return Array.from(set).sort()
  }, [all])

  const now = useMemo(() => Date.now(), [])
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
    const header = ['Дата и время', 'Действие', 'userId', 'companyId', 'Details']
    const rows = filtered.map((e) => [
      new Date(e.timestamp).toLocaleString('ru-RU'),
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

  function handleClear() {
    if (confirm('Удалить все записи логов старше 90 дней?')) {
      clearOldEntries(90)
    }
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">Логи и события системы</h1>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              Экспорт CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              Экспорт JSON
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClear}>
              Очистить логи старше 90 дней
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin">← Назад в админку</Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground mt-1">Всего событий</div>
          </div>
          <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{stats.last24h}</div>
            <div className="text-sm text-muted-foreground mt-1">За последние 24 ч</div>
          </div>
          <div className="border rounded-lg p-4 bg-primary/5 border-primary/30">
            <div className="text-2xl font-bold text-primary">{stats.last7d}</div>
            <div className="text-sm text-muted-foreground mt-1">За 7 дней</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={actionFilter || 'all'} onValueChange={(v) => { setActionFilter(v === 'all' ? '' : v); setPage(0) }}>
            <SelectTrigger className="border rounded-md px-3 py-2 text-sm bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все действия</SelectItem>
              {uniqueActions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Поиск по userId или details…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="max-w-sm"
          />
        </div>

        {/* Table */}
        {all.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            Системные логи пусты. События появятся после активности в системе.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            Логи не найдены по заданным фильтрам.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                    <th className="text-left px-4 py-3 font-medium">userId</th>
                    <th className="text-left px-4 py-3 font-medium">companyId</th>
                    <th className="text-left px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageItems.map((entry) => (
                    <>
                      <tr key={entry.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                          {new Date(entry.timestamp).toLocaleString('ru-RU', {
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
                            {expandedId === entry.id ? 'Свернуть' : 'JSON'}
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
                Записей: {filtered.length} | Стр. {page + 1} из {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  ← Назад
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Вперёд →
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </AdminGate>
  )
}
