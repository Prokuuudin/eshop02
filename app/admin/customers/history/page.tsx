'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuditLogStore } from '@/lib/audit-log-store'

const PAGE_SIZE = 50

const ACTION_COLORS: Record<string, string> = {
  order_created: 'bg-blue-100 text-blue-800',
  order_approved: 'bg-blue-100 text-blue-800',
  order_cancelled: 'bg-red-100 text-red-800',
  order_shipped: 'bg-blue-100 text-blue-800',
  payment_recorded: 'bg-purple-100 text-purple-800',
  invoice_issued: 'bg-purple-100 text-purple-800',
  user_invited: 'bg-green-100 text-green-800',
  user_removed: 'bg-red-100 text-red-800',
  user_role_changed: 'bg-green-100 text-green-800',
  company_profile_updated: 'bg-gray-100 text-gray-800',
  team_member_login: 'bg-green-100 text-green-800',
  team_member_logout: 'bg-gray-100 text-gray-600',
  api_key_generated: 'bg-orange-100 text-orange-800',
}

function actionColor(action: string) {
  return ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-700'
}

export default function AdminCustomerHistoryPage() {
  const entriesMap = useAuditLogStore((s) => s.entries)
  const clearOldEntries = useAuditLogStore((s) => s.clearOldEntries)

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
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

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null

    return all.filter((e) => {
      if (
        search &&
        !e.userEmail?.toLowerCase().includes(search.toLowerCase()) &&
        !e.userId?.toLowerCase().includes(search.toLowerCase())
      )
        return false
      if (actionFilter && e.action !== actionFilter) return false
      const ts = new Date(e.timestamp)
      if (from && ts < from) return false
      if (to && ts > to) return false
      return true
    })
  }, [all, search, actionFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleClear() {
    if (confirm('Удалить все записи старше 90 дней?')) {
      clearOldEntries(90)
    }
  }

  return (
    <AdminGate>
      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">История взаимодействий</h1>
          <div className="flex gap-2 flex-wrap">
            <Button variant="destructive" size="sm" onClick={handleClear}>
              Очистить старые записи (&gt; 90 дней)
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin">← Назад в админку</Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <Input
            placeholder="Поиск по email или userId…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="max-w-xs"
          />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Все действия</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-muted-foreground">От:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              className="border rounded-md px-2 py-1.5 text-sm bg-background"
            />
            <label className="text-muted-foreground">До:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              className="border rounded-md px-2 py-1.5 text-sm bg-background"
            />
          </div>
        </div>

        {/* Table */}
        {all.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            История взаимодействий пуста. События появятся после активности пользователей.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            Записи не найдены по заданным фильтрам.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Дата</th>
                    <th className="text-left px-4 py-3 font-medium">Пользователь</th>
                    <th className="text-left px-4 py-3 font-medium">Действие</th>
                    <th className="text-left px-4 py-3 font-medium">Компания</th>
                    <th className="text-left px-4 py-3 font-medium">Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageItems.map((entry) => (
                    <>
                      <tr key={entry.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString('ru-RU')}
                        </td>
                        <td className="px-4 py-3">
                          <div>{entry.userName ?? entry.userId}</div>
                          {entry.userEmail && (
                            <div className="text-xs text-muted-foreground">{entry.userEmail}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${actionColor(entry.action)}`}
                          >
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{entry.companyId}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              setExpandedId(expandedId === entry.id ? null : entry.id)
                            }
                            className="text-xs text-primary underline"
                          >
                            {expandedId === entry.id ? 'Свернуть' : 'Развернуть'}
                          </button>
                        </td>
                      </tr>
                      {expandedId === entry.id && (
                        <tr key={`${entry.id}-details`} className="bg-muted/20">
                          <td colSpan={5} className="px-4 py-3">
                            <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
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
