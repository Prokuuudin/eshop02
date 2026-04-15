'use client'

import React from 'react'
import { Activity, ChartNoAxesColumn, CircleDollarSign, Package, ShoppingBag, TrendingUp } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { getUserPurchaseAnalytics } from '@/lib/analytics-service'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import AccountPageHero from '@/components/account/AccountPageHero'
import TopProducts from '@/components/TopProducts'
import TopCategories from '@/components/TopCategories'
import OrderHistory from '@/components/OrderHistory'

export default function AnalyticsPage() {
  const { language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const currentUser = getCurrentUser()
  const analytics = getUserPurchaseAnalytics()

  const summaryCards = [
    {
      label: 'Всего заказов',
      value: String(analytics.totalOrders),
      helpText: `Средняя стоимость: ${formatEuro(analytics.averageOrderValue, locale)}`,
      icon: ShoppingBag
    },
    {
      label: 'Общие расходы',
      value: formatEuro(analytics.totalSpent, locale),
      helpText: `${analytics.totalItems} товаров`,
      icon: CircleDollarSign
    },
    {
      label: 'Средняя покупка',
      value: formatEuro(analytics.averageOrderValue, locale),
      helpText: 'За один заказ',
      icon: TrendingUp
    },
    {
      label: 'Позиций куплено',
      value: String(analytics.totalItems),
      helpText: `${analytics.topCategories.length} категорий`,
      icon: Package
    }
  ]

  return (
    <main className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <AccountPageHero
          eyebrow="Analytics"
          title="Статистика покупок"
          description={currentUser?.companyName
            ? `Компания: ${currentUser.companyName}`
            : currentUser?.name || 'Анонимный пользователь'}
          icon={ChartNoAxesColumn}
          accentClassName="border-gray-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-sky-950/40"
        />
      </div>

      {analytics.totalOrders === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-gray-500 shadow-sm dark:bg-gray-900 dark:text-gray-300">
            <Activity className="h-6 w-6" />
          </div>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
            Нет данных о покупках
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Ваша история покупок появится здесь после первого заказа
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
                      <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{card.label}</p>
                      <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</p>
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

          <section className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 h-full">
                <TopProducts analytics={analytics} />
              </div>
            </div>
            <div className="xl:col-span-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 h-full">
                <TopCategories analytics={analytics} />
              </div>
            </div>
            <div className="xl:col-span-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900 h-full">
                <OrderHistory analytics={analytics} />
              </div>
            </div>
          </section>

          {analytics.topCategories.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="border-b border-gray-200 p-6 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Детальная статистика по категориям
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Категория
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Товаров
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Сумма
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        % от общего
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topCategories.map((cat, idx) => {
                      const percentage = (cat.revenue / analytics.totalSpent) * 100
                      return (
                        <tr
                          key={idx}
                          className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                          <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {cat.category}
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-gray-400">
                            {cat.quantity}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {formatEuro(cat.revenue, locale)}
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-gray-400">
                            {percentage.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
