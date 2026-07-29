'use client'

import React, { useMemo, useState } from 'react'
import { useAuditLogStore } from '@/lib/audit-log-store'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

type FilterType = 'all' | 'action' | 'user' | 'date'

const ACTION_TRANSLATION_KEYS: Record<string, string> = {
  'order_created': 'account.auditLog.actions.orderCreated',
  'order_cancelled': 'account.auditLog.actions.orderCancelled',
  'payment_recorded': 'account.auditLog.actions.paymentRecorded',
  'invoice_issued': 'account.auditLog.actions.invoiceIssued',
  'user_invited': 'account.auditLog.actions.userInvited',
  'user_removed': 'account.auditLog.actions.userRemoved',
  'access_request_submitted': 'account.auditLog.actions.accessRequestSubmitted',
  'access_request_approved': 'account.auditLog.actions.accessRequestApproved',
  'access_request_rejected': 'account.auditLog.actions.accessRequestRejected',
  'settings_updated': 'account.auditLog.actions.settingsUpdated',
  'api_call': 'account.auditLog.actions.apiCall',
  'bulk_import': 'account.auditLog.actions.bulkImport',
}

const LANGUAGE_LOCALE: Record<string, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  lv: 'lv-LV',
}

const ACTION_COLORS: Record<string, string> = {
  'order_created': 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
  'order_cancelled': 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  'payment_recorded': 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  'invoice_issued': 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
  'user_invited': 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300',
  'user_removed': 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300',
  'access_request_submitted': 'bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300',
  'access_request_approved': 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300',
  'access_request_rejected': 'bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300',
  'settings_updated': 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300',
  'api_call': 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary',
  'bulk_import': 'bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300',
}

interface AuditLogViewerProps {
  companyId?: string
  limit?: number
}

export default function AuditLogViewer({
  companyId,
  limit = 50
}: AuditLogViewerProps): React.ReactElement {
  const { t, language } = useTranslation()
  const { getEntriesByCompany } = useAuditLogStore()
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterValue, setFilterValue] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const locale = LANGUAGE_LOCALE[language] || 'en-US'

  const allEntries = useMemo(
    () => companyId ? getEntriesByCompany(companyId) : [],
    [companyId, getEntriesByCompany]
  )

  const filteredEntries = useMemo(() => {
    let filtered = allEntries

    if (filterType === 'action' && filterValue) {
      filtered = filtered.filter(e => e.action === filterValue)
    } else if (filterType === 'user' && filterValue) {
      filtered = filtered.filter(e => e.userId.includes(filterValue) || e.userName?.includes(filterValue))
    } else if (filterType === 'date' && filterValue) {
      filtered = filtered.filter(e => {
        const entryDate = new Date(e.timestamp).toLocaleDateString(locale)
        return entryDate === filterValue
      })
    }

    return filtered.slice(0, limit)
  }, [allEntries, filterType, filterValue, limit, locale])

  const actionTypes = [...new Set(allEntries.map(e => e.action))]

  const getActionLabel = (action: string): string => {
    const key = ACTION_TRANSLATION_KEYS[action]
    if (!key) {
      return action
    }
    return t(key)
  }

  if (allEntries.length === 0) {
    return (
      <Card className="p-6 bg-card border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('account.auditLog.title')}
        </h3>
        <p className="text-muted-foreground text-center py-8">
          {t('account.auditLog.empty')}
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-6 bg-card border border-border">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {t('account.auditLog.titleWithCount', undefined, { count: allEntries.length })}
      </h3>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => { setFilterType('all'); setFilterValue('') }}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-muted text-foreground hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {t('account.auditLog.filter.all')}
          </button>
        </div>

        {filterType === 'action' ? (
          <Select value={filterValue || 'all'} onValueChange={(v) => setFilterValue(v === 'all' ? '' : v)}>
            <SelectTrigger className="px-3 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('account.auditLog.filter.allActions')}</SelectItem>
              {actionTypes.map(action => (
                <SelectItem key={action} value={action}>
                  {getActionLabel(action)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <button
            onClick={() => { setFilterType('action'); setFilterValue('') }}
            className="px-3 py-1 rounded text-sm font-medium bg-muted text-foreground hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {t('account.auditLog.filter.byActions')}
          </button>
        )}

        {filterType === 'user' ? (
          <input
            type="text"
            placeholder={t('account.auditLog.filter.userSearchPlaceholder')}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="px-3 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 bg-card text-foreground"
          />
        ) : (
          <button
            onClick={() => { setFilterType('user'); setFilterValue('') }}
            className="px-3 py-1 rounded text-sm font-medium bg-muted text-foreground hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {t('account.auditLog.filter.byUser')}
          </button>
        )}
      </div>

      {/* Entries */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredEntries.map((entry) => (
          (() => {
            const description = typeof entry.details?.description === 'string'
              ? entry.details.description
              : undefined

            return (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            className="p-3 rounded-lg border border-border bg-muted cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setExpandedId(expandedId === entry.id ? null : entry.id)
              }
            }}
          >
            <div className="flex items-start gap-3">
              <div className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                ACTION_COLORS[entry.action] || 'bg-muted text-foreground'
              }`}>
                {getActionLabel(entry.action)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {entry.userName || entry.userId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(new Date(entry.timestamp), locale)}
                  </p>
                </div>

                {description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {description}
                  </p>
                )}
              </div>

              <span className="text-gray-400 dark:text-gray-600 text-lg">
                {expandedId === entry.id ? '▼' : '▶'}
              </span>
            </div>

            {/* Expanded details */}
            {expandedId === entry.id && entry.details && (
              <div className="mt-3 p-3 bg-card rounded border border-gray-300 dark:border-gray-600">
                <p className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
                  {JSON.stringify(entry.details, null, 2)}
                </p>
              </div>
            )}
          </div>
            )
          })()
        ))}
      </div>

      {filteredEntries.length === 0 && allEntries.length > 0 && (
        <p className="text-center text-muted-foreground text-sm py-4">
          {t('account.auditLog.noFilterMatches')}
        </p>
      )}

      <p className="text-xs text-muted-foreground mt-4 text-center">
        {t('account.auditLog.shownOfTotal', undefined, { shown: filteredEntries.length, total: allEntries.length })}
      </p>
    </Card>
  )
}
