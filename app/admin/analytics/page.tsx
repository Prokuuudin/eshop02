'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { useOrders } from '@/lib/orders-store'
import { formatEuro } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'abc' | 'cohort' | 'seo'

type AbcGrade = 'A' | 'B' | 'C'

type AbcRow = {
  id: string
  title: string
  brand: string
  qty: number
  revenue: number
  revenuePct: number
  cumPct: number
  grade: AbcGrade
}

type SeoProduct = {
  id: string
  title: string
  brand: string
  category: string
  hasMetaTitle: boolean
  hasMetaDesc: boolean
  hasImage: boolean
  issueCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthKey(date: Date | string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  return date.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })
}

function retentionColor(pct: number): string {
  if (pct === 0) return 'bg-transparent text-gray-300 dark:text-gray-600'
  if (pct >= 60) return 'bg-emerald-600 text-white'
  if (pct >= 40) return 'bg-emerald-400 text-white'
  if (pct >= 25) return 'bg-emerald-200 text-emerald-900'
  if (pct >= 10) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
  return 'bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500'
}

const GRADE_STYLES: Record<AbcGrade, { badge: string; row: string }> = {
  A: {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    row: '',
  },
  B: {
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    row: '',
  },
  C: {
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    row: 'opacity-60',
  },
}

const ISSUE_LABELS: Record<string, string> = {
  metaTitle: 'Нет metaTitle',
  metaDesc: 'Нет metaDescription',
  image: 'Нет изображения',
}

// ─── Sub-section: ABC ─────────────────────────────────────────────────────────

function AbcSection() {
  const orders = useOrders((s) => s.orders)
  const [filter, setFilter] = useState<AbcGrade | 'all'>('all')

  const rows = useMemo<AbcRow[]>(() => {
    const map = new Map<string, { title: string; brand: string; qty: number; revenue: number }>()

    orders.forEach((o) => {
      o.items.forEach((item) => {
        const e = map.get(item.id) ?? {
          title: item.title,
          brand: (item as { brand?: string }).brand ?? '—',
          qty: 0,
          revenue: 0,
        }
        map.set(item.id, {
          ...e,
          qty: e.qty + item.quantity,
          revenue: e.revenue + item.price * item.quantity,
        })
      })
    })

    const sorted = Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)

    const total = sorted.reduce((s, r) => s + r.revenue, 0)
    if (total === 0) return []

    let cum = 0
    return sorted.map((r) => {
      const revenuePct = r.revenue / total
      cum += revenuePct
      const grade: AbcGrade = cum <= 0.8 ? 'A' : cum <= 0.95 ? 'B' : 'C'
      return { ...r, revenuePct, cumPct: cum, grade }
    })
  }, [orders])

  const counts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 }
    rows.forEach((r) => c[r.grade]++)
    return c
  }, [rows])

  const revenue = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 }
    rows.forEach((r) => { c[r.grade] += r.revenue })
    return c
  }, [rows])

  const total = rows.reduce((s, r) => s + r.revenue, 0)
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.grade === filter)

  if (orders.length === 0) {
    return <Empty text="Нет данных о заказах. ABC-анализ строится на истории продаж." />
  }

  return (
    <div className="space-y-6">

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {(['A', 'B', 'C'] as AbcGrade[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setFilter(filter === g ? 'all' : g)}
            className={[
              'rounded-xl border p-4 text-left transition-colors cursor-pointer',
              filter === g
                ? 'border-indigo-400 dark:border-primary bg-indigo-50 dark:bg-indigo-900/20'
                : 'border-border bg-white dark:bg-gray-900 hover:border-gray-300',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${GRADE_STYLES[g].badge}`}>
                {g}
              </span>
              <span className="text-sm text-muted-foreground">{counts[g]} товаров</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatEuro(revenue[g], 'ru-RU')}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {total > 0 ? Math.round((revenue[g] / total) * 100) : 0}% выручки
            </p>
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
        A — 80% выручки · B — следующие 15% · C — оставшиеся 5%
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">#</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Товар</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Бренд</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Кол-во</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Выручка</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">% от итога</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Накопл. %</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Группа</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
            {filtered.map((r, i) => (
              <tr key={r.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${GRADE_STYLES[r.grade].row}`}>
                <td className="px-4 py-2.5 text-gray-400 tabular-nums">{rows.indexOf(r) + 1}</td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/products/${r.id}`}
                    className="text-foreground hover:text-primary dark:hover:text-indigo-400 hover:underline"
                  >
                    {r.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.brand}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{r.qty}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">
                  {formatEuro(r.revenue, 'ru-RU')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {(r.revenuePct * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className={r.cumPct > 0.95 ? 'text-red-500' : r.cumPct > 0.8 ? 'text-yellow-600' : 'text-emerald-600'}>
                    {(r.cumPct * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_STYLES[r.grade].badge}`}>
                    {r.grade}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">Нет товаров в группе {filter}</div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-section: Cohort ──────────────────────────────────────────────────────

function CohortSection() {
  const orders = useOrders((s) => s.orders)
  const [showPct, setShowPct] = useState(true)

  const { cohortMonths, matrix, cohortSizes, maxOffset } = useMemo(() => {
    if (orders.length === 0) return { cohortMonths: [], matrix: new Map(), cohortSizes: new Map(), maxOffset: 0 }

    // Find each customer's first purchase month
    const firstMonth = new Map<string, string>()
    orders.forEach((o) => {
      if (!o.email) return
      const mk = toMonthKey(o.createdAt)
      const existing = firstMonth.get(o.email)
      if (!existing || mk < existing) firstMonth.set(o.email, mk)
    })

    // Build matrix: cohortMonth → offset → Set<email>
    const mat = new Map<string, Map<number, Set<string>>>()
    orders.forEach((o) => {
      if (!o.email) return
      const cohort = firstMonth.get(o.email)
      if (!cohort) return
      const offset = monthDiff(cohort, toMonthKey(o.createdAt))
      if (offset < 0) return

      if (!mat.has(cohort)) mat.set(cohort, new Map())
      const row = mat.get(cohort)!
      if (!row.has(offset)) row.set(offset, new Set())
      row.get(offset)!.add(o.email)
    })

    // Cohort sizes (= size of offset 0)
    const sizes = new Map<string, number>()
    firstMonth.forEach((cohort) => {
      sizes.set(cohort, (sizes.get(cohort) ?? 0) + 1)
    })

    const sortedCohorts = Array.from(mat.keys()).sort()
    let max = 0
    mat.forEach((row) => {
      row.forEach((_, offset) => { if (offset > max) max = offset })
    })

    return {
      cohortMonths: sortedCohorts,
      matrix: mat,
      cohortSizes: sizes,
      maxOffset: Math.min(max, 11),
    }
  }, [orders])

  if (orders.length === 0) {
    return <Empty text="Нет данных о заказах." />
  }
  if (cohortMonths.length === 0) {
    return <Empty text="Недостаточно данных для когортного анализа." />
  }

  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Строки — месяц первой покупки когорты. Столбцы — месяцев с момента первой покупки.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            М+0 = месяц первой покупки, М+1 = следующий месяц и т.д.
          </p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {(['pct', 'count'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setShowPct(m === 'pct')}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                (m === 'pct') === showPct
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              {m === 'pct' ? '%' : '#'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-border">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 border-r border-border">
                Когорта
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">
                Клиентов
              </th>
              {offsets.map((o) => (
                <th key={o} className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[64px]">
                  М+{o}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohortMonths.map((cohort) => {
              const row = matrix.get(cohort)
              const size = cohortSizes.get(cohort) ?? 0

              return (
                <tr key={cohort} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-900 z-10 border-r border-border">
                    {monthLabel(cohort)}
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground font-medium">
                    {size}
                  </td>
                  {offsets.map((offset) => {
                    const count = row?.get(offset)?.size ?? 0
                    const p = size > 0 ? Math.round((count / size) * 100) : 0

                    // Don't show future months
                    const cohortDate = new Date(cohort + '-01')
                    const expectedDate = new Date(cohortDate.getFullYear(), cohortDate.getMonth() + offset, 1)
                    const isFuture = expectedDate > new Date()

                    return (
                      <td
                        key={offset}
                        className={`px-3 py-2 text-center tabular-nums font-medium ${
                          isFuture ? 'text-gray-200 dark:text-gray-700' : retentionColor(p)
                        }`}
                      >
                        {isFuture ? '·' : showPct ? (count > 0 ? `${p}%` : '—') : (count > 0 ? count : '—')}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: '60%+', cls: 'bg-emerald-600' },
          { label: '40–60%', cls: 'bg-emerald-400' },
          { label: '25–40%', cls: 'bg-emerald-200' },
          { label: '10–25%', cls: 'bg-emerald-100' },
          { label: '<10%', cls: 'bg-gray-50 border border-gray-200' },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-muted-foreground">
            <span className={`inline-block h-3 w-3 rounded-sm ${l.cls}`} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sub-section: SEO ─────────────────────────────────────────────────────────

function SeoSection() {
  const [products, setProducts] = useState<SeoProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [issueFilter, setIssueFilter] = useState<'all' | 'metaTitle' | 'metaDesc' | 'image'>('all')

  useEffect(() => {
    setLoading(true)
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((data: { data?: { products?: Record<string, unknown>[] } }) => {
        const raw = data.data?.products ?? []
        const mapped: SeoProduct[] = raw.map((p) => {
          const hasMetaTitle = Boolean((p.metaTitle as string | undefined)?.trim())
          const hasMetaDesc = Boolean((p.metaDescription as string | undefined)?.trim())
          const hasImage = Boolean(
            (p.image as string | undefined)?.trim() ||
            ((p.images as string[] | undefined)?.length ?? 0) > 0
          )
          const issueCount = (hasMetaTitle ? 0 : 1) + (hasMetaDesc ? 0 : 1) + (hasImage ? 0 : 1)
          return {
            id: p.id as string,
            title: (p.title as string) || '—',
            brand: (p.brand as string) || '—',
            category: (p.category as string) || '—',
            hasMetaTitle,
            hasMetaDesc,
            hasImage,
            issueCount,
          }
        })
        setProducts(mapped)
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => ({
    all: products.filter((p) => p.issueCount > 0).length,
    metaTitle: products.filter((p) => !p.hasMetaTitle).length,
    metaDesc: products.filter((p) => !p.hasMetaDesc).length,
    image: products.filter((p) => !p.hasImage).length,
  }), [products])

  const filtered = useMemo(() => {
    const withIssues = products.filter((p) => p.issueCount > 0)
    if (issueFilter === 'all') return withIssues.sort((a, b) => b.issueCount - a.issueCount)
    return withIssues
      .filter((p) =>
        issueFilter === 'metaTitle' ? !p.hasMetaTitle :
        issueFilter === 'metaDesc' ? !p.hasMetaDesc :
        !p.hasImage
      )
      .sort((a, b) => b.issueCount - a.issueCount)
  }, [products, issueFilter])

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Загрузка каталога...</div>

  const allOk = products.length > 0 && counts.all === 0

  return (
    <div className="space-y-5">

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'all' as const, label: 'С проблемами', color: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10', text: 'text-red-700 dark:text-red-300' },
          { key: 'metaTitle' as const, label: 'Нет metaTitle', color: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/10', text: 'text-orange-700 dark:text-orange-300' },
          { key: 'metaDesc' as const, label: 'Нет metaDescription', color: 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10', text: 'text-yellow-700 dark:text-yellow-300' },
          { key: 'image' as const, label: 'Нет изображения', color: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setIssueFilter(issueFilter === s.key ? 'all' : s.key)}
            className={[
              'rounded-xl border p-4 text-left transition-colors',
              s.color,
              issueFilter === s.key ? 'ring-2 ring-indigo-400 ring-offset-1' : '',
            ].join(' ')}
          >
            <p className={`text-2xl font-bold ${s.text}`}>{counts[s.key]}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {allOk && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Все {products.length} товаров заполнены корректно. SEO-пробелов нет.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-auto rounded-xl border border-border">
          <table className="min-w-full text-sm bg-white dark:bg-gray-900">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Товар</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Бренд / Категория</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">metaTitle</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">metaDescription</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Фото</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Проблем</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2.5 font-medium text-foreground max-w-xs">
                    <span className="truncate block">{p.title}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <p>{p.brand}</p>
                    <p className="text-xs capitalize">{p.category}</p>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.hasMetaTitle
                      ? <span className="text-emerald-500">✓</span>
                      : <span className="text-red-500 font-semibold">✗</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.hasMetaDesc
                      ? <span className="text-emerald-500">✓</span>
                      : <span className="text-red-500 font-semibold">✗</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.hasImage
                      ? <span className="text-emerald-500">✓</span>
                      : <span className="text-red-500 font-semibold">✗</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.issueCount === 3 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                      p.issueCount === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                    }`}>
                      {p.issueCount}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="text-xs text-primary hover:underline dark:text-primary whitespace-nowrap"
                    >
                      Редактировать →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {products.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Всего в каталоге: {products.length} товаров · Заполнены корректно: {products.length - counts.all}
        </p>
      )}
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

function Empty({ text }: { text: string }) {
  return (
    <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-500 rounded-xl border border-border">
      {text}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { value: Tab; label: string; desc: string }[] = [
  { value: 'abc',    label: 'ABC-анализ',       desc: 'Топ товаров по доле в выручке' },
  { value: 'cohort', label: 'Когортный анализ', desc: 'Retention клиентов по месяцам' },
  { value: 'seo',    label: 'SEO-отчёт',        desc: 'Товары с пробелами в метаданных' },
]

export default function AdminAnalyticsPage() {
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
                  ? 'border-primary text-primary dark:border-indigo-400'
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
