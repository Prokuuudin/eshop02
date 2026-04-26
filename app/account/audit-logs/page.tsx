'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { useCompanyStore } from '@/lib/company-store'
import AuditLogViewer from '@/components/AuditLogViewer'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

export default function AuditLogsPage() {
  const router = useRouter()
  const [user, setUser] = useState(getCurrentUser())
  const { getCompany } = useCompanyStore()
  const { t } = useTranslation()

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
            {t('account.auditLog.companyOnly')}
          </p>
          <Button onClick={() => router.push('/account')}>
            {t('account.auditLog.backToAccount')}
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
          {t('account.auditLog.pageTitle')}
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
            {t('account.auditLog.infoTitle')}
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• {t('account.auditLog.infoItem1')}</li>
            <li>• {t('account.auditLog.infoItem2')}</li>
            <li>• {t('account.auditLog.infoItem3')}</li>
            <li>• {t('account.auditLog.infoItem4')}</li>
            <li>• {t('account.auditLog.infoItem5')}</li>
            <li>• {t('account.auditLog.infoItem6')}</li>
          </ul>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">
            {t('account.auditLog.retentionNote')}
          </p>
        </div>
      </div>
    </main>
  )
}
