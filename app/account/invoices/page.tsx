'use client'

import React, { useState, useMemo } from 'react'
import { BadgeAlert, Building2, CircleDollarSign, CreditCard, FileSpreadsheet, ReceiptText, RotateCcw, ShieldHalf, Wallet } from 'lucide-react'
import { useInvoicesStore } from '@/lib/invoices-store'
import { useCompanyStore } from '@/lib/company-store'
import { logAuditAction } from '@/lib/audit-log-store'
import { getCurrentUser } from '@/lib/auth'
import { isDemoB2BUser, resetDemoB2BSession, seedDemoB2BData } from '@/lib/demo-b2b'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import InvoiceList from '@/components/InvoiceList'
import InvoiceViewer from '@/components/InvoiceViewer'
import AccountPageHero from '@/components/account/AccountPageHero'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { Invoice } from '@/lib/invoices-store'

export default function InvoicesPage() {
  const { t, language } = useTranslation()
  const currentUser = getCurrentUser()
  const { getInvoicesByCompany, recordPayment } = useInvoicesStore()
  const { getCompany } = useCompanyStore()
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [isSeedingDemo, setIsSeedingDemo] = useState(false)
  const [isResettingDemo, setIsResettingDemo] = useState(false)

  const locale = getLocaleFromLanguage(language)
  const formatPrice = (value: number): string => formatEuro(value, locale)
  const companyId = currentUser?.companyId ?? null
  const isDemoSession = isDemoB2BUser(currentUser)
  const company = companyId ? getCompany(companyId) : null
  const invoices = companyId ? getInvoicesByCompany(companyId) : []

  // Calculate statistics before branching so hook order stays stable.
  const stats = useMemo(() => {
    const totalIssued = invoices.filter(inv => inv.status === 'issued').length
    const totalPaid = invoices.filter(inv => inv.status === 'paid').length
    const totalOverdue = invoices.filter(inv => inv.status === 'overdue').length
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.total, 0)
    const paidAmount = invoices.reduce((sum, inv) => sum + (inv.status === 'paid' ? inv.total : 0), 0)
    const remainingAmount = invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0)

    return {
      totalIssued,
      totalPaid,
      totalOverdue,
      totalAmount,
      paidAmount,
      remainingAmount
    }
  }, [invoices])

  const invoiceSummaryCards = [
    {
      label: t('account.invoices.statIssued'),
      value: String(stats.totalIssued),
      helpText: formatPrice(stats.remainingAmount),
      icon: ReceiptText,
      valueClassName: 'text-gray-900 dark:text-gray-100'
    },
    {
      label: t('account.invoices.statPaid'),
      value: String(stats.totalPaid),
      helpText: formatPrice(stats.paidAmount),
      icon: Wallet,
      valueClassName: 'text-green-600 dark:text-green-400'
    },
    {
      label: t('account.invoices.statOverdue'),
      value: String(stats.totalOverdue),
      helpText: t('account.invoices.statOverdueHelp'),
      icon: BadgeAlert,
      valueClassName: 'text-red-600 dark:text-red-400'
    },
    {
      label: t('account.invoices.statTotal'),
      value: String(invoices.length),
      helpText: formatPrice(stats.totalAmount),
      icon: FileSpreadsheet,
      valueClassName: 'text-gray-900 dark:text-gray-100'
    }
  ]

  const handleSeedDemoB2B = (): void => {
    setIsSeedingDemo(true)
    seedDemoB2BData()
    window.location.reload()
  }

  const handleResetDemoB2B = (): void => {
    setIsResettingDemo(true)
    resetDemoB2BSession()
    window.location.reload()
  }

  // Redirect if not B2B user
  if (!currentUser?.companyId) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <AccountPageHero
          eyebrow="Billing"
          title={t('account.invoices.title')}
          description={t('account.invoices.description')}
          icon={ReceiptText}
          accentClassName="border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-800 dark:from-amber-950/30 dark:via-gray-900 dark:to-orange-950/30"
        />

        <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm dark:bg-gray-900 dark:text-amber-200">
                <BadgeAlert className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
                  {t('account.invoices.b2bOnly')}
                </h2>
                <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
                  {t('account.invoices.b2bOnlyDesc')}
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Button onClick={handleSeedDemoB2B} disabled={isSeedingDemo}>
                    {isSeedingDemo ? t('account.invoices.loadingDemo') : t('account.invoices.loadDemo')}
                  </Button>
                  <Link href="/account">
                    <Button variant="outline">{t('account.invoices.backToAccount')}</Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('account.invoices.howToAccess')}</h3>
              <Building2 className="h-5 w-5 text-gray-400" />
            </div>
            <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <p>{t('account.invoices.howToAccessStep1')}</p>
              <p>{t('account.invoices.howToAccessStep2')}</p>
              <p>{t('account.invoices.howToAccessStep3')}</p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  const handleRecordPayment = (invoiceId: string, payment: any) => {
    recordPayment(invoiceId, payment)
    
    // Log the payment
    if (currentUser?.companyId) {
      logAuditAction(
        currentUser.companyId,
        currentUser.id,
        'payment_recorded',
        {
          invoiceId,
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference
        },
        { userName: currentUser.name, userEmail: currentUser.email }
      )
    }

    // Refresh selected invoice
    const updated = useInvoicesStore.getState().getInvoice(invoiceId)
    if (updated) {
      setSelectedInvoice(updated)
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <section className="mb-8">
        <AccountPageHero
          eyebrow="Billing"
          title={t('account.invoices.title')}
          description={t('account.invoices.companyDesc', undefined, { name: company?.companyName || t('account.invoices.sectionCompany') })}
          icon={ReceiptText}
          accentClassName="border-gray-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/40"
        />
      </section>

      {isDemoSession && (
        <section className="mb-6 rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-4 shadow-sm dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">{t('account.invoices.demoActive')}</p>
              <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
                {t('account.invoices.demoDesc')}
              </p>
            </div>
            <Button variant="outline" onClick={handleResetDemoB2B} disabled={isResettingDemo} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              {isResettingDemo ? t('account.invoices.exitingDemo') : t('account.invoices.exitDemo')}
            </Button>
          </div>
        </section>
      )}

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {invoiceSummaryCards.map((card) => {
          const Icon = card.icon

          return (
            <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{card.label}</p>
                  <p className={`mt-3 text-2xl font-bold ${card.valueClassName}`}>{card.value}</p>
                </div>
                <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-300">{card.helpText}</p>
            </div>
          )
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('account.invoices.allInvoices')}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('account.invoices.selectHint')}</p>
              </div>
              <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <CreditCard className="h-4 w-4" />
              </div>
            </div>
            <InvoiceList
              invoices={invoices}
              onSelectInvoice={setSelectedInvoice}
              selectedInvoiceId={selectedInvoice?.id}
            />
          </section>
        </div>

        <div className="space-y-6 xl:col-span-4">
          {company && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('account.invoices.sectionCompany')}</h3>
                <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Building2 className="h-4 w-4" />
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                    <p className="text-gray-600 dark:text-gray-400">{t('account.invoices.fieldName')}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{company.companyName}</p>
                  </div>
                  {company.taxId && (
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">{t('account.invoices.fieldTaxId')}</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{company.taxId}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">{t('account.invoices.fieldPaymentTerms')}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{t('account.invoices.fieldPaymentTermsDays', undefined, { days: String(company.paymentTermDays) })}</p>
                </div>
                {company.creditLimit && (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-gray-600 dark:text-gray-400">Кредитный лимит</p>
                      <CircleDollarSign className="h-4 w-4 text-gray-400" />
                    </div>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {formatPrice(company.creditLimit)}
                    </p>
                    <div className="mt-3 h-2 rounded bg-gray-100 dark:bg-gray-700">
                      <div
                        className="h-2 rounded bg-blue-500"
                        style={{
                          width: `${Math.min(100, (company.usedCredit / company.creditLimit) * 100)}%`
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {formatPrice(company.usedCredit)} из {formatPrice(company.creditLimit)} использовано
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-blue-900 dark:text-blue-200">{t('account.invoices.helpTitle')}</h3>
              <ShieldHalf className="h-4 w-4 text-blue-700 dark:text-blue-300" />
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              {t('account.invoices.helpText')}
            </p>
            <Link href="/contact">
              <Button variant="outline" size="sm" className="mt-4 w-full">
                {t('account.invoices.contactSupport')}
              </Button>
            </Link>
          </section>
        </div>
      </div>

      {/* Invoice Viewer Modal */}
      {selectedInvoice && (
        <InvoiceViewer
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onRecordPayment={handleRecordPayment}
        />
      )}
    </main>
  )
}
