'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAdminLogStore, ACTION_LABELS, type AdminLogAction } from '@/lib/admin-log-store'

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

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const PAGE_SIZE = 50

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminLogPage() {
  const entries = useAdminLogStore((s) => s.entries)
  const clear = useAdminLogStore((s) => s.clear)

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
    return sorted.filter((e) => {
      if (actionFilter && e.action !== actionFilter) return false
      if (adminFilter && e.adminEmail !== adminFilter) return false
      if (q) {
        const hay = `${e.adminEmail} ${e.entityId} ${e.entityTitle ?? ''} ${e.details ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [sorted, actionFilter, adminFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Stats
  const stats = useMemo(() => {
    const now = Date.now()
    return {
      total: entries.length,
      today: entries.filter((e) => now - new Date(e.at).getTime() < 86400_000).length,
      week:  entries.filter((e) => now - new Date(e.at).getTime() < 7 * 86400_000).length,
    }
  }, [entries])

  const downloadCSV = () => {
    const header = ['Дата', 'Администратор', 'Email', 'Действие', 'Тип', 'ID', 'Объект', 'До', 'После', 'Детали']
    const rows = filtered.map((e) => [
      fmtDate(e.at),
      e.adminName ?? '',
      e.adminEmail,
      ACTION_LABELS[e.action as AdminLogAction] ?? e.action,
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
            <h1 className="text-2xl font-bold text-foreground">Лог действий администраторов</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Кто, когда и что изменил в системе
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadCSV}>Экспорт CSV</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (confirm('Удалить записи старше 90 дней?')) clear(90) }}
            >
              Очистить старше 90 дней
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/system/logs">← Системные логи</Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Всего событий', value: stats.total },
            { label: 'За последние 24 ч', value: stats.today, cls: 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800' },
            { label: 'За 7 дней', value: stats.week, cls: 'bg-primary/5 border-primary/30 dark:bg-primary/20/10 dark:border-primary/40' },
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
            placeholder="Поиск по объекту, email, деталям..."
            className="w-64"
          />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value as AdminLogAction | ''); setPage(0) }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="">Все действия</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a as AdminLogAction] ?? a}</option>
            ))}
          </select>
          <select
            value={adminFilter}
            onChange={(e) => { setAdminFilter(e.target.value); setPage(0) }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="">Все администраторы</option>
            {uniqueAdmins.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="self-center text-sm text-muted-foreground ml-auto">
            {filtered.length} из {entries.length}
          </span>
        </div>

        {/* Table */}
        {entries.length === 0 ? (
          <div className="rounded-xl border border-border py-16 text-center text-sm text-gray-400 dark:text-gray-500">
            Действия пока не зарегистрированы. Лог наполнится после первых операций в админке.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            Нет событий по заданным фильтрам
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm bg-card">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Время</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Кто</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Действие</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Объект</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">До → После</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pageItems.map((entry) => (
                    <>
                      <tr
                        key={entry.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {fmtDate(entry.at)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{entry.adminName ?? entry.adminEmail}</p>
                          {entry.adminName && <p className="text-xs text-gray-400">{entry.adminEmail}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${actionBadgeCls(entry.action)}`}>
                            {ACTION_LABELS[entry.action as AdminLogAction] ?? entry.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-800 dark:text-gray-200 truncate max-w-[180px]">{entry.entityTitle ?? entry.entityId}</p>
                          <p className="text-xs text-gray-400 font-mono">{entry.entityType}:{entry.entityId.slice(0, 12)}</p>
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
                        <tr key={`${entry.id}-exp`} className="bg-muted/30">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                              <div>
                                <p className="font-semibold text-muted-foreground mb-1">ID события</p>
                                <code className="font-mono text-gray-700 dark:text-gray-300">{entry.id}</code>
                              </div>
                              <div>
                                <p className="font-semibold text-muted-foreground mb-1">Тип / ID объекта</p>
                                <code className="font-mono text-gray-700 dark:text-gray-300">{entry.entityType} / {entry.entityId}</code>
                              </div>
                              {entry.before && (
                                <div>
                                  <p className="font-semibold text-muted-foreground mb-1">До</p>
                                  <pre className="bg-red-50 dark:bg-red-900/10 rounded p-2 overflow-x-auto text-red-700 dark:text-red-300">
                                    {JSON.stringify(entry.before, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {entry.after && (
                                <div>
                                  <p className="font-semibold text-muted-foreground mb-1">После</p>
                                  <pre className="bg-green-50 dark:bg-green-900/10 rounded p-2 overflow-x-auto text-green-700 dark:text-green-300">
                                    {JSON.stringify(entry.after, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {entry.details && (
                                <div className="md:col-span-2">
                                  <p className="font-semibold text-muted-foreground mb-1">Детали</p>
                                  <p className="text-gray-700 dark:text-gray-300">{entry.details}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Стр. {page + 1} из {totalPages}
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
