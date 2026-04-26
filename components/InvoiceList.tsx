'use client'

import React, { useState } from 'react'
import { Invoice, InvoiceStatus } from '@/lib/invoices-store'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type InvoiceListProps = {
  invoices: Invoice[]
  onSelectInvoice: (invoice: Invoice) => void
  selectedInvoiceId?: string
}

const getStatusColor = (status: InvoiceStatus): string => {
  switch (status) {
    case 'paid':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
    case 'issued':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
    case 'overdue':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
    case 'draft':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    case 'cancelled':
      return 'bg-gray-300 text-gray-900 dark:bg-gray-700 dark:text-gray-300'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const getStatusLabel = (status: InvoiceStatus, t: (key: string) => string): string => {
  switch (status) {
    case 'paid':
      return t('account.invoice.status.paid')
    case 'issued':
      return t('account.invoice.status.issued')
    case 'overdue':
      return t('account.invoice.status.overdue')
    case 'draft':
      return t('account.invoice.status.draft')
    case 'cancelled':
      return t('account.invoice.status.cancelled')
    default:
      return status
  }
}

const getStatusIcon = (status: InvoiceStatus): string => {
  switch (status) {
    case 'paid':
      return '✓'
    case 'issued':
      return '→'
    case 'overdue':
      return '⚠'
    case 'draft':
      return '○'
    case 'cancelled':
      return '✕'
    default:
      return '•'
  }
}

export default function InvoiceList({ invoices, onSelectInvoice, selectedInvoiceId }: InvoiceListProps) {
  const { t, language } = useTranslation()
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'status'>('date')
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('all')

  const locale = getLocaleFromLanguage(language)
  const formatPrice = (value: number): string => formatEuro(value, locale)

  const filtered = invoices.filter(inv => filterStatus === 'all' || inv.status === filterStatus)

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return b.issuedDate.getTime() - a.issuedDate.getTime()
      case 'amount':
        return b.total - a.total
      case 'status':
        return a.status.localeCompare(b.status)
      default:
        return 0
    }
  })

  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-600 dark:text-gray-300">{t('account.invoiceList.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | 'all')}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
          >
            <option value="all">{t('account.invoiceList.filter.allStatuses')}</option>
            <option value="issued">{t('account.invoice.status.issued')}</option>
            <option value="paid">{t('account.invoice.status.paid')}</option>
            <option value="overdue">{t('account.invoice.status.overdue')}</option>
            <option value="draft">{t('account.invoice.status.draft')}</option>
            <option value="cancelled">{t('account.invoice.status.cancelled')}</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'amount' | 'status')}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
          >
            <option value="date">{t('account.invoiceList.sort.byDate')}</option>
            <option value="amount">{t('account.invoiceList.sort.byAmount')}</option>
            <option value="status">{t('account.invoiceList.sort.byStatus')}</option>
          </select>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400">
          {t('account.invoiceList.filteredCount', undefined, { shown: sorted.length, total: invoices.length })}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {sorted.map((invoice) => (
          <div
            key={invoice.id}
            onClick={() => onSelectInvoice(invoice)}
            className={`rounded-lg border-2 p-4 cursor-pointer transition-colors ${
              selectedInvoiceId === invoice.id
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            } `}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {invoice.invoiceNumber}
                  </h3>
                  <Badge className={`${getStatusColor(invoice.status)} whitespace-nowrap`}>
                    {getStatusIcon(invoice.status)} {getStatusLabel(invoice.status, t)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">{t('account.invoiceList.issuedAtLabel')}</span>{' '}
                    {invoice.issuedDate.toLocaleDateString(locale)}
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">{t('account.invoiceList.dueAtLabel')}</span>{' '}
                    <span className={invoice.dueDate < new Date() && invoice.status !== 'paid' ? 'text-red-600' : ''}>
                      {invoice.dueDate.toLocaleDateString(locale)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-bold text-lg text-gray-900 dark:text-gray-100">
                  {formatPrice(invoice.total)}
                </div>
                {invoice.status === 'issued' && (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {t('account.invoiceList.remainingLabel')} {formatPrice(invoice.remainingAmount)}
                  </div>
                )}
                {invoice.status === 'paid' && invoice.paymentRecords.length > 0 && (
                  <div className="text-sm text-green-600 dark:text-green-400">
                    {t('account.invoiceList.paymentsCount', undefined, { count: invoice.paymentRecords.length })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-600 dark:text-gray-300">{t('account.invoiceList.noFilteredResults')}</p>
        </div>
      )}
    </div>
  )
}
