'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { formatEuro } from '@/lib/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '90d' | 'all'
type Metric = 'revenue' | 'qty'

type ProductRow = { id: string; title: string; brand: string; qty: number; revenue: number }
type BrandRow = { brand: string; qty: number; revenue: number }
type CategoryRow = { cat: string; qty: number; revenue: number }
type TrendRow = { month: string; cat: string; qty: number; revenue: number }

type BreakdownResponse = {
  orderCount: number
  totalRevenue: number
  totalQty: number
  uniqueProducts: number
  topProductsByRevenue: ProductRow[]
  topProductsByQty: ProductRow[]
  topBrandsByRevenue: BrandRow[]
  topBrandsByQty: BrandRow[]
  categorySummary: CategoryRow[]
  categoryTrend: TrendRow[]
}

const EMPTY_BREAKDOWN: BreakdownResponse = {
  orderCount: 0,
  totalRevenue: 0,
  totalQty: 0,
  uniqueProducts: 0,
  topProductsByRevenue: [],
  topProductsByQty: [],
  topBrandsByRevenue: [],
  topBrandsByQty: [],
  categorySummary: [],
  categoryTrend: [],
}

const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })
}

const CAT_LABELS: Record<string, string> = {
  hair: 'Волосы',
  face: 'Лицо',
  body: 'Тело',
  nails: 'Ногти',
  equipment: 'Аксессуары и инструменты',
}

const CAT_COLORS: Record<string, string> = {
  hair: '#6366f1',
  face: '#ec4899',
  body: '#f59e0b',
  nails: '#10b981',
  equipment: '#3b82f6',
}

const fmt = (v: number) => formatEuro(v, 'ru-RU')
const pct = (v: number, total: number) => total > 0 ? `${Math.round((v / total) * 100)}%` : '0%'

// ─── Chart components ─────────────────────────────────────────────────────────

function HBar({ value, max, color = '#6366f1' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

type StackedMonth = { month: string; sortKey: string; [cat: string]: string | number }

function StackedBarChart({
  data,
  categories,
  metric,
}: {
  data: StackedMonth[]
  categories: string[]
  metric: Metric
}) {
  const [hovered, setHovered] = useState<{ monthIdx: number; cat: string } | null>(null)

  const totals = useMemo(
    () => data.map((d) => categories.reduce((s, cat) => s + (((d[cat] as number) | 0)), 0)),
    [data, categories]
  )
  const max = Math.max(...totals, 1)
  const h = 200
  const barW = Math.max(18, Math.min(56, Math.floor(600 / Math.max(data.length, 1)) - 6))
  const gap = Math.max(4, Math.floor(600 / Math.max(data.length, 1)) - barW)
  const chartW = Math.max(600, data.length * (barW + gap) + 44)

  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Нет данных</p>
  }

  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={h + 56} className="block select-none">
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = 8 + (h - 8) * (1 - frac)
          const label = frac === 0 ? '0' : metric === 'revenue'
            ? `€${Math.round(max * frac).toLocaleString('ru-RU')}`
            : Math.round(max * frac).toLocaleString('ru-RU')
          return (
            <g key={frac}>
              <line x1={36} x2={chartW - 8} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={32} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{label}</text>
            </g>
          )
        })}

        {data.map((d, i) => {
          const x = 36 + i * (barW + gap)
          let yTop = h + 8

          return (
            <g key={i}>
              {categories.map((cat) => {
                const val = (d[cat] as number) ?? 0
                if (val === 0) return null
                const barH = Math.max(1, (val / max) * (h - 16))
                yTop -= barH
                const isHov = hovered?.monthIdx === i && hovered.cat === cat
                return (
                  <rect
                    key={cat}
                    x={x}
                    y={yTop}
                    width={barW}
                    height={barH}
                    fill={CAT_COLORS[cat] ?? '#94a3b8'}
                    opacity={hovered && !isHov ? 0.35 : 0.88}
                    rx={cat === categories[categories.length - 1] ? 3 : 0}
                    style={{ cursor: 'default' }}
                    onMouseEnter={() => setHovered({ monthIdx: i, cat })}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <title>{CAT_LABELS[cat] ?? cat}: {metric === 'revenue' ? fmt(val) : `${val} шт`}</title>
                  </rect>
                )
              })}
              <text
                x={x + barW / 2}
                y={h + 30}
                textAnchor="middle"
                fontSize={9}
                fill="#6b7280"
                transform={data.length > 8 ? `rotate(-30,${x + barW / 2},${h + 30})` : undefined}
              >
                {d.month}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1">
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CAT_COLORS[cat] ?? '#94a3b8' }} />
            {CAT_LABELS[cat] ?? cat}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalesBreakdownPage(): React.ReactElement {
  const [period, setPeriod] = useState<Period>('30d')
  const [metric, setMetric] = useState<Metric>('revenue')
  const [loaded, setLoaded] = useState<BreakdownResponse | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin/sales/breakdown?period=${period}`, { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`))))
      .then((json: BreakdownResponse) => setLoaded(json))
      .catch((e) => { if ((e as Error).name !== 'AbortError') setLoaded(EMPTY_BREAKDOWN) })
    return () => controller.abort()
  }, [period])

  const data = loaded ?? EMPTY_BREAKDOWN

  // ── KPIs
  const totalRevenue = data.totalRevenue
  const totalQty = data.totalQty
  const uniqueProducts = data.uniqueProducts
  const aov = data.orderCount > 0 ? totalRevenue / data.orderCount : 0

  // ── Top products / brands (server ranks both metrics; pick the active one)
  const topProducts = metric === 'revenue' ? data.topProductsByRevenue : data.topProductsByQty
  const topProductMax = topProducts[0]?.[metric === 'revenue' ? 'revenue' : 'qty'] ?? 1

  const topBrands = metric === 'revenue' ? data.topBrandsByRevenue : data.topBrandsByQty
  const topBrandMax = topBrands[0]?.[metric === 'revenue' ? 'revenue' : 'qty'] ?? 1

  // ── Category trend by month (stacked bar) - pivot flat rows into one entry per month
  const { categoryTrend, activeCategories } = useMemo(() => {
    const monthMap = new Map<string, StackedMonth>()
    data.categoryTrend.forEach((row) => {
      if (!monthMap.has(row.month)) {
        monthMap.set(row.month, { month: monthLabel(row.month), sortKey: row.month })
      }
      const entry = monthMap.get(row.month)!
      entry[row.cat] = metric === 'revenue' ? row.revenue : row.qty
    })

    const trend = Array.from(monthMap.values()).sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)))

    const catSet = new Set<string>()
    data.categoryTrend.forEach((row) => catSet.add(row.cat))
    const active = Array.from(catSet).filter((c) => c !== 'other')

    return { categoryTrend: trend, activeCategories: active }
  }, [data.categoryTrend, metric])

  // ── Category summary (donut-like table)
  const categorySummary = data.categorySummary

  const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    { value: '7d', label: '7 дней' },
    { value: '30d', label: '30 дней' },
    { value: '90d', label: '90 дней' },
    { value: 'all', label: 'Всё время' },
  ]

  const sectionCls = 'rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
  const headerCls = 'border-b border-border px-5 py-3'
  const bodyPad = 'px-5 py-4'

  return (
    <AdminGate access="full">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Аналитика: товары и категории</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loaded === null ? 'Загрузка…' : `${data.orderCount} заказов · ${totalQty} единиц товаров`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Metric toggle */}
            <div className="flex rounded-lg border border-border bg-card p-1">
              {(['revenue', 'qty'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    metric === m
                      ? 'bg-primary text-primary-foreground'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {m === 'revenue' ? 'Выручка' : 'Кол-во'}
                </button>
              ))}
            </div>
            {/* Period toggle */}
            <div className="flex rounded-lg border border-border bg-card p-1">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    period === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Link href="/admin/sales/analytics" className="text-sm text-primary hover:underline dark:text-primary">
              ← Продажи
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Выручка', value: fmt(totalRevenue) },
            { label: 'Заказов', value: data.orderCount.toLocaleString('ru-RU') },
            { label: 'Средний чек', value: fmt(aov) },
            { label: 'Уникальных товаров', value: uniqueProducts.toLocaleString('ru-RU') },
          ].map((k) => (
            <div key={k.label} className={sectionCls + ' p-4'}>
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Top products + brands (2-col) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Top-10 products */}
          <div className={sectionCls}>
            <div className={headerCls + ' flex items-center justify-between'}>
              <h2 className="text-sm font-semibold text-foreground">
                Топ-10 товаров · {metric === 'revenue' ? 'по выручке' : 'по количеству'}
              </h2>
              <span className="text-xs text-muted-foreground">из {uniqueProducts}</span>
            </div>
            {topProducts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Нет данных за период</p>
            ) : (
              <div className="divide-y divide-border">
                {topProducts.map((p, i) => {
                  const val = metric === 'revenue' ? p.revenue : p.qty
                  const valStr = metric === 'revenue' ? fmt(p.revenue) : `${p.qty} шт`
                  return (
                    <div key={i} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 shrink-0 text-xs font-mono text-muted-foreground">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{p.title}</p>
                            <p className="text-xs text-muted-foreground">{p.brand}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-primary">{valStr}</p>
                          <p className="text-xs text-muted-foreground">{pct(metric === 'revenue' ? p.revenue : p.qty, metric === 'revenue' ? totalRevenue : totalQty)}</p>
                        </div>
                      </div>
                      <HBar value={val} max={topProductMax} color="#6366f1" />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top brands */}
          <div className={sectionCls}>
            <div className={headerCls + ' flex items-center justify-between'}>
              <h2 className="text-sm font-semibold text-foreground">
                Топ бренды · {metric === 'revenue' ? 'по выручке' : 'по количеству'}
              </h2>
              <span className="text-xs text-muted-foreground">{topBrands.length} брендов</span>
            </div>
            {topBrands.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Нет данных за период</p>
            ) : (
              <div className="divide-y divide-border">
                {topBrands.map((b, i) => {
                  const val = metric === 'revenue' ? b.revenue : b.qty
                  const valStr = metric === 'revenue' ? fmt(b.revenue) : `${b.qty} шт`
                  return (
                    <div key={i} className="px-5 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 shrink-0 text-xs font-mono text-muted-foreground">{i + 1}</span>
                          <span className="truncate text-sm text-foreground">{b.brand}</span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{valStr}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">{pct(val, metric === 'revenue' ? totalRevenue : totalQty)}</span>
                        </div>
                      </div>
                      <HBar value={val} max={topBrandMax} color="#10b981" />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Category breakdown + trend */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Category summary */}
          <div className={sectionCls}>
            <div className={headerCls}>
              <h2 className="text-sm font-semibold text-foreground">По категориям</h2>
            </div>
            {categorySummary.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Нет данных</p>
            ) : (
              <div className={bodyPad + ' space-y-3'}>
                {categorySummary.map((c) => {
                  const val = metric === 'revenue' ? c.revenue : c.qty
                  const max = categorySummary[0] ? (metric === 'revenue' ? categorySummary[0].revenue : categorySummary[0].qty) : 1
                  const color = CAT_COLORS[c.cat] ?? '#94a3b8'
                  return (
                    <div key={c.cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} />
                          <span className="text-foreground">{CAT_LABELS[c.cat] ?? c.cat}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-semibold text-foreground">
                            {metric === 'revenue' ? fmt(c.revenue) : `${c.qty} шт`}
                          </span>
                          <span className="ml-1.5 text-xs text-muted-foreground">{pct(val, metric === 'revenue' ? totalRevenue : totalQty)}</span>
                        </div>
                      </div>
                      <HBar value={val} max={max} color={color} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Stacked bar: category dynamics by month */}
          <div className={sectionCls + ' lg:col-span-2'}>
            <div className={headerCls}>
              <h2 className="text-sm font-semibold text-foreground">
                Динамика по категориям · {metric === 'revenue' ? 'выручка по месяцам' : 'продажи по месяцам'}
              </h2>
            </div>
            <div className={bodyPad}>
              <StackedBarChart
                data={categoryTrend}
                categories={activeCategories}
                metric={metric}
              />
            </div>
          </div>
        </div>

      </div>
    </AdminGate>
  )
}
