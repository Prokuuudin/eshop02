'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { useCompanyStore } from '@/lib/company-store'
import AuditLogViewer from '@/components/AuditLogViewer'
import { Button } from '@/components/ui/button'

export default function AuditLogsPage() {
  const router = useRouter()
  const [user, setUser] = useState(getCurrentUser())
  const { getCompany } = useCompanyStore()

  useEffect(() => {
    const currentUser = getCurrentUser()
    if (!currentUser || !currentUser.companyId) {
      router.push('/account')
      return
    }
    setUser(currentUser)
  }, [router])

  if (!user?.companyId) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center bg-gray-50 dark:bg-gray-800">
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
            Эта страница доступна только для компаний
          </p>
          <Button onClick={() => router.push('/account')}>
            ← Вернуться в аккаунт
          </Button>
        </div>
      </main>
    )
  }

  const company = getCompany(user.companyId)

  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          📋 История действий компании
        </h1>
        {company && (
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {company.companyName} (ID: {company.companyId})
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div>
          <AuditLogViewer
            companyId={user.companyId}
            limit={100}
          />
        </div>

        {/* Info block */}
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            ℹ Что здесь отслеживается?
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Создание и отмена заказов</li>
            <li>• Запись платежей и выпуск счётов</li>
            <li>• Приглашения и удаление пользователей</li>
            <li>• Обновления настроек компании</li>
            <li>• API запросы интеграций</li>
            <li>• Массовые импорты данных</li>
          </ul>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">
            Логи хранятся в течение 90 дней в соответствии с GDPR
          </p>
        </div>
      </div>
    </main>
  )
}
