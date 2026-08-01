'use client'

import AbcSection from './AbcSection'
import CohortSection from './CohortSection'
import SeoSection from './SeoSection'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { useOrders } from '@/lib/orders-store'
import { formatEuro } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'abc' | 'cohort' | 'seo'

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { value: Tab; label: string; desc: string }[] = [
  { value: 'abc',    label: 'ABC-анализ',       desc: 'Топ товаров по доле в выручке' },
  { value: 'cohort', label: 'Когортный анализ', desc: 'Retention клиентов по месяцам' },
  { value: 'seo',    label: 'SEO-отчёт',        desc: 'Товары с пробелами в метаданных' },
]

export default function AdminAnalyticsPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('abc')
  const active = TABS.find((t) => t.value === tab)!

  return (
    <AdminGate access="full">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Аналитика каталога</h1>
            <p className="mt-1 text-sm text-muted-foreground">{active.desc}</p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-primary hover:underline dark:text-primary"
          >
            ← Назад в админку
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-0">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={[
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.value
                  ? 'border-primary text-primary dark:border-primary/70'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'abc'    && <AbcSection />}
        {tab === 'cohort' && <CohortSection />}
        {tab === 'seo'    && <SeoSection />}

      </div>
    </AdminGate>
  )
}
