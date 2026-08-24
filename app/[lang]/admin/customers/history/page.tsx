'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminFetchJson, classifyAdminError } from '@/lib/admin-ui-errors'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { useAuthStore } from '@/lib/auth-store'
import { hasAdminPermission } from '@/lib/admin-permissions'
import { useAdminLocale } from '@/lib/use-admin-locale'

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

export default function AdminCustomerHistoryPage(): React.ReactElement {
  const { locale, l } = useAdminLocale()
  const confirmAction = useAdminConfirm()
  const currentUser = useAuthStore((state) => state.user)
  const canClearHistory = hasAdminPermission(currentUser, 'audit.read')
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    adminFetchJson<{ entries: ActivityEntry[] }>('/api/admin/customer-activity?take=500')
      .then(({ entries }) => { setEntries(entries); setLoadState('ready') })
      .catch((error) => { setLoadError(classifyAdminError(error, l('История клиентов', 'Customer history', 'Klientu vēsture')).message); setLoadState('error') })
  }, [l])

  async function reload() {
    setLoadState('loading')
    try {
      const { entries } = await adminFetchJson<{ entries: ActivityEntry[] }>('/api/admin/customer-activity?take=500')
      setEntries(entries)
      setLoadState('ready')
    } catch (error) {
      setLoadError(classifyAdminError(error, l('История клиентов', 'Customer history', 'Klientu vēsture')).message)
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

  async function handleClear() {
    const decision = await confirmAction({ title: l('Удалить старую историю клиентов?', 'Delete old customer history?', 'Dzēst veco klientu vēsturi?'), description: l('Записи старше 90 дней будут удалены без возможности восстановления.', 'Records older than 90 days will be deleted permanently.', 'Ieraksti, kas vecāki par 90 dienām, tiks neatgriezeniski dzēsti.'), affected: [l('История клиентов старше 90 дней', 'Customer history older than 90 days', 'Klientu vēsture, kas vecāka par 90 dienām')], confirmText: l('УДАЛИТЬ', 'DELETE', 'DZĒST'), requireReason: true, destructive: true })
    if (!decision.confirmed) return
    try {
      await adminFetchJson('/api/admin/company-activity-log?olderThanDays=90', { method: 'DELETE' })
      await reload()
    } catch (error) {
      setLoadError(classifyAdminError(error, l('Удаление истории', 'History deletion', 'Vēstures dzēšana')).message)
      setLoadState('error')
    }
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">{l('История взаимодействий', 'Interaction history', 'Mijiedarbību vēsture')}</h1>
          <div className="flex gap-2 flex-wrap">
            {canClearHistory && (
              <Button variant="destructive" size="sm" onClick={handleClear}>
                {l('Очистить старые записи (> 90 дней)', 'Clear old records (> 90 days)', 'Notīrīt vecos ierakstus (> 90 dienām)')}
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/admin">← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <Input
            placeholder={l('Поиск по email или userId…', 'Search by email or user ID…', 'Meklēt pēc e-pasta vai lietotāja ID…')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="max-w-xs"
          />
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
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="customer-history-date-from" className="text-muted-foreground">{l('От:', 'From:', 'No:')}</label>
            <Input
              id="customer-history-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              className="h-8 w-auto px-2 py-1.5 text-sm"
            />
            <label htmlFor="customer-history-date-to" className="text-muted-foreground">{l('До:', 'To:', 'Līdz:')}</label>
            <Input
              id="customer-history-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              className="h-8 w-auto px-2 py-1.5 text-sm"
            />
          </div>
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
            {l('История взаимодействий пуста. События появятся после активности пользователей.', 'The interaction history is empty. Events will appear after user activity.', 'Mijiedarbību vēsture ir tukša. Notikumi parādīsies pēc lietotāju aktivitātes.')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            {l('Записи не найдены по заданным фильтрам.', 'No records match the selected filters.', 'Atlasītajiem filtriem neatbilst neviens ieraksts.')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">{l('Дата', 'Date', 'Datums')}</th>
                    <th className="text-left px-4 py-3 font-medium">{l('Пользователь', 'User', 'Lietotājs')}</th>
                    <th className="text-left px-4 py-3 font-medium">{l('Действие', 'Action', 'Darbība')}</th>
                    <th className="text-left px-4 py-3 font-medium">{l('Компания', 'Company', 'Uzņēmums')}</th>
                    <th className="text-left px-4 py-3 font-medium">{l('Детали', 'Details', 'Informācija')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageItems.map((entry) => (
                    <React.Fragment key={entry.id}>
                      <tr className="hover:bg-muted/30">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString(locale)}
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
                            {expandedId === entry.id ? l('Свернуть', 'Collapse', 'Sakļaut') : l('Развернуть', 'Expand', 'Izvērst')}
                          </button>
                        </td>
                      </tr>
                      {expandedId === entry.id && (
                        <tr className="bg-muted/20">
                          <td colSpan={5} className="px-4 py-3">
                            <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                {l(`Записей: ${filtered.length} | Стр. ${page + 1} из ${totalPages}`, `Records: ${filtered.length} | Page ${page + 1} of ${totalPages}`, `Ieraksti: ${filtered.length} | Lapa ${page + 1} no ${totalPages}`)}
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
