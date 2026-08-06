'use client'

import React, { useState, useEffect, useCallback } from 'react'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCompanyStore } from '@/lib/company-store'
import { type TeamRole } from '@/lib/auth'
import { useTranslation } from '@/lib/use-translation'
import { pointsToEuros } from '@/lib/bonus-program'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { Search } from 'lucide-react'

type DbUser = {
  id: string
  email: string
  name: string | null
  platformRole: string
  companyId: string | null
  companyName: string | null
  teamRole: string | null
  phone: string | null
  cardNumber: string | null
  bonusPoints: number
  mfaEnabled: boolean
  createdAt: string
  updatedAt: string
}

export default function AdminAccountsPage(): React.ReactElement {
  const { t, language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const { getCompanies, syncFromDb } = useCompanyStore()
  const companies = getCompanies()

  useEffect(() => {
    void syncFromDb()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [memberRolesDraft, setMemberRolesDraft] = useState<Record<string, TeamRole>>({})
  const [roleUpdateInProgress, setRoleUpdateInProgress] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // DB users state
  const [dbUsers, setDbUsers] = useState<DbUser[]>([])
  const [dbTotal, setDbTotal] = useState(0)
  const [dbSearch, setDbSearch] = useState('')
  const [dbRoleFilter, setDbRoleFilter] = useState('')
  const [dbLoading, setDbLoading] = useState(false)

  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'en' ? en : lv)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)

  const loadDbUsers = useCallback(async () => {
    setDbLoading(true)
    try {
      const params = new URLSearchParams({ take: '50' })
      if (dbSearch) params.set('search', dbSearch)
      if (dbRoleFilter) params.set('role', dbRoleFilter)
      const res = await fetch(`/api/admin/users?${params}`)
      const data = await res.json()
      if (data.users) {
        setDbUsers(data.users)
        setDbTotal(data.total)
      }
    } catch {
      // ignore
    } finally {
      setDbLoading(false)
    }
  }, [dbSearch, dbRoleFilter])

  useEffect(() => {
    queueMicrotask(() => void loadDbUsers())
  }, [loadDbUsers])

  const handleUpdateDbRole = async (userId: string, newRole: string) => {
    const target = dbUsers.find((user) => user.id === userId)
    if (!target) return
    const currentPassword = window.prompt(l('Подтвердите текущий пароль администратора', 'Confirm your current administrator password', 'Apstipriniet administratora paroli'))
    if (!currentPassword) return
    const mfaCode = window.prompt(l('Введите 6-значный код MFA', 'Enter the 6-digit MFA code', 'Ievadiet 6 ciparu MFA kodu'))
    if (!mfaCode) return
    const reason = window.prompt(l('Укажите причину изменения роли', 'State the reason for the role change', 'Norādiet lomas maiņas iemeslu'))
    if (!reason || reason.trim().length < 5) return
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, platformRole: newRole, expectedUpdatedAt: target.updatedAt, currentPassword, mfaCode, reason }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'role_update_failed')
      if (payload.pendingApproval) {
        setMessage(l('Запрос на повышение создан. Его должен подтвердить другой администратор.', 'Promotion request created. Another administrator must approve it.', 'Paaugstināšanas pieprasījums izveidots. Tas jāapstiprina citam administratoram.'))
        return
      }
      setDbUsers((prev) => prev.map((u) => u.id === userId
        ? { ...u, platformRole: payload.user.platformRole, updatedAt: payload.user.updatedAt }
        : u))
      setMessage(tl('admin.accounts.msg.roleUpdated', 'Роль обновлена', 'Role updated', 'Loma atjaunota'))
    } catch (cause) {
      if (cause instanceof Error) setError(cause.message)
      setError('Ошибка обновления роли')
    }
  }

  const resolveMemberRoleDraft = (userId: string, fallbackRole: TeamRole): TeamRole => {
    return memberRolesDraft[userId] ?? fallbackRole
  }

  const handleUpdateTeamMemberRole = async (companyId: string, userId: string, fallbackRole: TeamRole) => {
    const nextRole = resolveMemberRoleDraft(userId, fallbackRole)

    setRoleUpdateInProgress(userId)
    setMessage('')
    setError('')

    const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    if (!response.ok) {
      setError(tl('admin.accounts.msg.updateRoleFailed', 'Не удалось изменить роль', 'Failed to change role', 'Neizdevas nomainit lomu'))
      setRoleUpdateInProgress(null)
      return
    }

    setMemberRolesDraft((prev) => ({ ...prev, [userId]: nextRole }))
    setMessage(tl('admin.accounts.msg.roleUpdated', 'Роль пользователя обновлена', 'User role updated', 'Lietotaja loma atjaunota'))
    setRoleUpdateInProgress(null)
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6 text-foreground">
        <div>
          <h1 className="text-3xl font-bold">{tl('admin.accounts.title', 'Управление аккаунтами', 'Account management', 'Kontu parvaldiba')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tl('admin.accounts.subtitle', 'Роли сотрудников компаний (viewer, buyer, manager, admin)', 'Company staff roles (viewer, buyer, manager, admin)', 'Uznemuma darbinieku lomas (viewer, buyer, manager, admin)')}
          </p>
        </div>

        {message && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}

        {/* DB Users section */}
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <h2 className="text-xl font-semibold flex-1">
              {tl('admin.accounts.dbUsers', 'Пользователи в БД', 'Users in DB', 'Lietotaji DB')} ({dbTotal})
            </h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-8 w-56"
                placeholder={tl('admin.accounts.searchPlaceholder', 'Email, имя, карта...', 'Email, name, card...', 'E-pasts, vards, karte...')}
                value={dbSearch}
                onChange={(e) => setDbSearch(e.target.value)}
              />
            </div>
            <Select value={dbRoleFilter || 'all'} onValueChange={(v) => setDbRoleFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все роли</SelectItem>
                <SelectItem value="customer">customer</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dbLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : dbUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пользователей не найдено.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 font-medium">Имя</th>
                    <th className="pb-2 pr-4 font-medium">Карта</th>
                    <th className="pb-2 pr-4 font-medium">Бонусы</th>
                    <th className="pb-2 pr-4 font-medium">Роль</th>
                    <th className="pb-2 font-medium">Компания</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {dbUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-2 pr-4 font-mono text-xs">{u.email}</td>
                      <td className="py-2 pr-4">{u.name ?? '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{u.cardNumber ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {u.bonusPoints}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({formatEuro(pointsToEuros(u.bonusPoints ?? 0), locale)})
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <Select value={u.platformRole} onValueChange={(v) => handleUpdateDbRole(u.id, v)}>
                          <SelectTrigger className="rounded border border-border bg-card px-2 py-1 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="customer">customer</SelectItem>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="b2b">b2b</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {u.companyName ?? u.companyId ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Company team roles from PostgreSQL */}
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">{tl('admin.accounts.companies', 'Компании', 'Companies', 'Uznemumi')} ({companies.length})</h2>

          <div className="space-y-4">
            {companies.map((company) => {
              const companyUsers = company.teamMembers

              return (
                <div key={company.companyId} className="rounded-lg border border-border p-4">
                  <p className="font-semibold">{company.companyName}</p>
                  <p className="text-sm text-muted-foreground">ID: {company.companyId}</p>

                  <div className="mt-3 rounded-md border border-border p-3">
                    <p className="text-sm font-medium">{tl('admin.accounts.accountsAndRoles', 'Аккаунты компании и роли', 'Company accounts and roles', 'Uznemuma konti un lomas')}</p>

                    {companyUsers.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">{tl('admin.accounts.noAccounts', 'Аккаунтов пока нет.', 'No accounts yet.', 'Kontu vel nav.')}</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {companyUsers.map((companyUser) => {
                          const selectedRole = resolveMemberRoleDraft(companyUser.userId, companyUser.role)
                          const isBusy = roleUpdateInProgress === companyUser.userId

                          return (
                            <div
                              key={companyUser.userId}
                              className="grid grid-cols-1 gap-2 rounded border border-border p-2 md:grid-cols-[1.5fr_1fr_auto] md:items-center"
                            >
                              <div>
                                <p className="text-sm font-medium">{companyUser.name || companyUser.email}</p>
                                <p className="text-xs text-muted-foreground">{companyUser.email}</p>
                              </div>

                              <Select
                                value={selectedRole}
                                onValueChange={(v) => {
                                  const role = v as TeamRole
                                  setMemberRolesDraft((prev) => ({ ...prev, [companyUser.userId]: role }))
                                }}
                              >
                                <SelectTrigger className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">viewer</SelectItem>
                                  <SelectItem value="buyer">buyer</SelectItem>
                                  <SelectItem value="manager">manager</SelectItem>
                                  <SelectItem value="admin">admin</SelectItem>
                                </SelectContent>
                              </Select>

                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => handleUpdateTeamMemberRole(company.companyId, companyUser.userId, companyUser.role)}
                              >
                                {isBusy
                                  ? tl('admin.accounts.saving', 'Сохраняем...', 'Saving...', 'Saglabajam...')
                                  : tl('admin.accounts.changeRole', 'Сменить роль', 'Change role', 'Mainit lomu')}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </AdminGate>
  )
}
