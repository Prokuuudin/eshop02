'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Activity, ChartNoAxesColumn, CircleDollarSign, Package, ShoppingBag, TrendingUp } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { getUserPurchaseAnalytics } from '@/lib/analytics-service'
import { useOrders, type Order } from '@/lib/orders-store'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import AccountPageHero from '@/components/account/AccountPageHero'
import TopProducts from '@/components/TopProducts'
import TopCategories from '@/components/TopCategories'
import OrderHistory from '@/components/OrderHistory'
import PeriodComparison from '@/components/account/PeriodComparison'

export default function AnalyticsPage(): React.ReactElement {
  const { language, t } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const currentUser = getCurrentUser()
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')

  // Order history lives in the DB. Load it here too — this page must not depend on the user
  // having visited /account first (which is the only other place that hydrates the store).
  const orders = useOrders((s) => s.orders)
  const replaceOrders = useOrders((s) => s.replaceOrders)
  useEffect(() => {
    const controller = new AbortController()
    replaceOrders([])
    fetch('/api/orders/my', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Orders request failed: ${r.status}`)
        return r.json()
      })
      .then(({ orders: dbOrders }) => {
        if (!Array.isArray(dbOrders)) throw new Error('Invalid orders response')
        replaceOrders(dbOrders as Order[])
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadState('error')
      })
    return () => controller.abort()
  }, [replaceOrders, currentUser?.id])

  const analytics = useMemo(
    () => getUserPurchaseAnalytics(currentUser?.email, currentUser?.id, locale),
    // Recompute whenever the store changes; getUserPurchaseAnalytics reads it internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, currentUser?.email, currentUser?.id, locale]
  )

  const summaryCards = [
    {
      label: t('account.analytics.totalOrders'),
      value: String(analytics.totalOrders),
      helpText: t('account.analytics.avgCost', undefined, { value: formatEuro(analytics.averageOrderValue, locale) }),
      icon: ShoppingBag
    },
    {
      label: t('account.analytics.totalSpent'),
      value: formatEuro(analytics.totalSpent, locale),
      helpText: t('account.analytics.totalItemsHelp', undefined, { count: analytics.totalItems }),
      icon: CircleDollarSign
    },
    {
      label: t('account.analytics.avgOrder'),
      value: formatEuro(analytics.averageOrderValue, locale),
      helpText: t('account.analytics.avgHelp'),
      icon: TrendingUp
    },
    {
      label: t('account.analytics.totalItems'),
      value: String(analytics.totalItems),
      helpText: t('account.analytics.categoriesHelp', undefined, { count: analytics.topCategories.length }),
      icon: Package
    }
  ]

  return (
    <main className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <AccountPageHero
          eyebrow="Analytics"
          title={t('account.analyticsTitle')}
          description={currentUser?.companyName
            ? t('account.analytics.company', undefined, { name: currentUser.companyName })
            : currentUser?.name || t('account.analytics.anonymous')}
          icon={ChartNoAxesColumn}
          accentClassName="border-gray-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-sky-950/40"
        />
      </div>

      {loadState === 'loading' ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground" role="status">
          {t('common.loading')}
        </div>
      ) : loadState === 'error' ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" role="alert">
          <p className="font-semibold">{t('account.analytics.loadError')}</p>
          <p className="mt-2 text-sm opacity-80">{t('account.analytics.loadErrorDesc')}</p>
        </div>
      ) : analytics.totalOrders === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-gray-500 shadow-sm dark:bg-gray-900 dark:text-gray-300">
            <Activity className="h-6 w-6" />
          </div>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('account.analytics.noData')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('account.analytics.noDataDesc')}
          </p>
        </div>
      ) : (
        <>
          <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon

              return (
                <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{card.label}</p>
                      <p className="mt-3 text-2xl font-bold text-foreground">{card.value}</p>
                    </div>
                    <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{card.helpText}</p>
                </div>
              )
            })}
          </section>

          <PeriodComparison orders={orders} />

          <section className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-4 [&>*]:h-full">
              <TopProducts analytics={analytics} />
            </div>
            <div className="min-w-0 xl:col-span-4 [&>*]:h-full">
              <TopCategories analytics={analytics} />
            </div>
            <div className="min-w-0 xl:col-span-4 [&>*]:h-full">
              <OrderHistory analytics={analytics} />
            </div>
          </section>
        </>
      )}
    </main>
  )
}
