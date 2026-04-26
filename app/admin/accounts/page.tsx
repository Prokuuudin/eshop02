'use client'

import React, { useState } from 'react'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { useCompanyStore } from '@/lib/company-store'
import { getCurrentUser, listCompanyUsers, updateUserTeamRole, type TeamRole } from '@/lib/auth'
import { useTranslation } from '@/lib/use-translation'

export default function AdminAccountsPage() {
  const { t, language } = useTranslation()
  const { getCompanies } = useCompanyStore()
  const companies = getCompanies()
  const [memberRolesDraft, setMemberRolesDraft] = useState<Record<string, TeamRole>>({})
  const [roleUpdateInProgress, setRoleUpdateInProgress] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'en' ? en : lv)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)

  const resolveMemberRoleDraft = (userId: string, fallbackRole: TeamRole): TeamRole => {
    return memberRolesDraft[userId] ?? fallbackRole
  }

  const handleUpdateTeamMemberRole = (userId: string, fallbackRole: TeamRole) => {
    const reviewer = getCurrentUser()
    const nextRole = resolveMemberRoleDraft(userId, fallbackRole)

    setRoleUpdateInProgress(userId)
    setMessage('')
    setError('')

    const result = updateUserTeamRole(userId, nextRole, reviewer)
    if (!result.success) {
      setError(result.error || tl('admin.accounts.msg.updateRoleFailed', 'Не удалось изменить роль', 'Failed to change role', 'Neizdevas nomainit lomu'))
      setRoleUpdateInProgress(null)
      return
    }

    setMemberRolesDraft((prev) => ({
      ...prev,
      [userId]: nextRole
    }))
    setMessage(tl('admin.accounts.msg.roleUpdated', 'Роль пользователя обновлена', 'User role updated', 'Lietotaja loma atjaunota'))
    setRoleUpdateInProgress(null)
  }

  return (
    <AdminGate>
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-6 text-gray-900 dark:text-gray-100">
        <div>
          <h1 className="text-3xl font-bold">{tl('admin.accounts.title', 'Управление аккаунтами', 'Account management', 'Kontu parvaldiba')}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
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

        <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-xl font-semibold mb-4">{tl('admin.accounts.companies', 'Компании', 'Companies', 'Uznemumi')} ({companies.length})</h2>

          <div className="space-y-4">
            {companies.map((company) => {
              const companyUsers = listCompanyUsers(company.companyId)

              return (
                <div key={company.companyId} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <p className="font-semibold">{company.companyName}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">ID: {company.companyId}</p>

                  <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                    <p className="text-sm font-medium">{tl('admin.accounts.accountsAndRoles', 'Аккаунты компании и роли', 'Company accounts and roles', 'Uznemuma konti un lomas')}</p>

                    {companyUsers.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{tl('admin.accounts.noAccounts', 'Аккаунтов пока нет.', 'No accounts yet.', 'Kontu vel nav.')}</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {companyUsers.map((companyUser) => {
                          const selectedRole = resolveMemberRoleDraft(companyUser.id, companyUser.teamRole ?? 'viewer')
                          const isBusy = roleUpdateInProgress === companyUser.id

                          return (
                            <div
                              key={companyUser.id}
                              className="grid grid-cols-1 gap-2 rounded border border-gray-200 dark:border-gray-700 p-2 md:grid-cols-[1.5fr_1fr_auto] md:items-center"
                            >
                              <div>
                                <p className="text-sm font-medium">{companyUser.name || companyUser.email}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-300">{companyUser.email}</p>
                              </div>

                              <select
                                value={selectedRole}
                                onChange={(event) => {
                                  const role = event.target.value as TeamRole
                                  setMemberRolesDraft((prev) => ({ ...prev, [companyUser.id]: role }))
                                }}
                                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                              >
                                <option value="viewer">viewer</option>
                                <option value="buyer">buyer</option>
                                <option value="manager">manager</option>
                                <option value="admin">admin</option>
                              </select>

                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => handleUpdateTeamMemberRole(companyUser.id, companyUser.teamRole ?? 'viewer')}
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
