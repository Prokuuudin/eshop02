'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'

const CATEGORY_LABELS: Record<string, string> = { hair: 'Волосы', face: 'Лицо', body: 'Тело', nails: 'Ногти', equipment: 'Аксессуары и инструменты', unknown: 'Без категории' }
const PERIODS = [{ value: '7d', label: '7 дней' }, { value: '30d', label: '30 дней' }, { value: '90d', label: '90 дней' }, { value: 'all', label: 'Всё время' }] as const
type Period = (typeof PERIODS)[number]['value']

type Analytics = {
  period: Period; totalWithPromo: number; totalOrders: number; totalDiscounts: number; promoRevenue: number
  avgDiscountPercent: number; promoOrderShare: number; discountToRevenue: number
  codeStats: { code: string; count: number; totalDiscount: number; revenue: number; avgOrder: number }[]
  categoryStats: { cat: string; count: number; totalDiscount: number }[]
  recentPromoOrders: { id: string; email: string; promoCode: string; discount: number; total: number; createdAt: string }[]
}

const eur = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' })
const formatEur = (amount: number): string => eur.format(amount)

export default function AdminMarketingAnalyticsPage(): React.ReactElement {
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback((signal: AbortSignal) => {
    fetch(`/api/admin/marketing/analytics?period=${period}`, { signal, cache: 'no-store' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`)))
      .then((json: Analytics) => { setData(json); setError(false) })
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(true) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }, [period])

  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load, reloadKey])
  const categories = useMemo(() => data?.categoryStats.map((row) => ({ ...row, label: CATEGORY_LABELS[row.cat] ?? row.cat })) ?? [], [data])

  return <AdminGate><main className="w-full space-y-6 py-4">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href="/admin" className="mb-1 inline-block text-sm text-primary hover:underline">← Назад в админку</Link><h1 className="text-2xl font-bold text-foreground">Аналитика продвижения</h1><p className="mt-1 text-sm text-muted-foreground">Эффективность промокодов по неотменённым заказам</p></div>
      <div className="flex rounded-lg border border-border bg-card p-1" aria-label="Период отчёта">
        {PERIODS.map((item) => <button key={item.value} type="button" onClick={() => { if (item.value !== period) { setLoading(true); setError(false); setPeriod(item.value) } }} aria-pressed={period === item.value} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${period === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{item.label}</button>)}
      </div>
    </div>

    {loading ? <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground" role="status">Загрузка отчёта…</div>
    : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/20"><p className="font-medium text-red-800 dark:text-red-300">Не удалось загрузить аналитику</p><p className="mt-1 text-sm text-red-700 dark:text-red-400">Проверьте соединение и попробуйте снова.</p><button type="button" onClick={() => { setLoading(true); setError(false); setReloadKey((key) => key + 1) }} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Повторить</button></div>
    : !data || data.totalWithPromo === 0 ? <EmptyAnalytics totalOrders={data?.totalOrders ?? 0} />
    : <>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Основные показатели">
        <Metric label="Заказов с промокодом" value={String(data.totalWithPromo)} hint={`${data.promoOrderShare.toFixed(1)}% из ${data.totalOrders} заказов`} />
        <Metric label="Выручка с промокодами" value={formatEur(data.promoRevenue)} hint={`Средний чек ${formatEur(data.promoRevenue / data.totalWithPromo)}`} />
        <Metric label="Предоставлено скидок" value={formatEur(data.totalDiscounts)} hint={`${data.discountToRevenue.toFixed(1)}% от выручки`} accent="text-primary" />
        <Metric label="Средняя скидка" value={`${data.avgDiscountPercent.toFixed(1)}%`} hint="от суммы товаров до скидки" />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Эффективность промокодов</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-muted/50 text-left text-xs text-muted-foreground"><th className="px-5 py-3 font-medium">Код</th><th className="px-5 py-3 font-medium">Заказы</th><th className="px-5 py-3 font-medium">Выручка</th><th className="px-5 py-3 font-medium">Скидки</th><th className="px-5 py-3 font-medium">Средний чек</th></tr></thead><tbody className="divide-y divide-border">{data.codeStats.map((row) => <tr key={row.code} className="hover:bg-muted/40"><td className="px-5 py-3 font-mono font-semibold">{row.code}</td><td className="px-5 py-3">{row.count}</td><td className="px-5 py-3 font-medium text-emerald-600 dark:text-emerald-400">{formatEur(row.revenue)}</td><td className="px-5 py-3 text-primary">{formatEur(row.totalDiscount)}</td><td className="px-5 py-3">{formatEur(row.avgOrder)}</td></tr>)}</tbody></table></div></section>

      {categories.length > 0 && <section className="rounded-xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Товары со скидкой по категориям</h2></div><div className="space-y-3 p-5">{categories.map((row) => { const max = categories[0]?.count || 1; return <div key={row.cat}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="font-medium">{row.label}</span><span className="text-muted-foreground">{row.count} ед. · {formatEur(row.totalDiscount)} скидки</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(row.count / max * 100)}%` }} /></div></div>})}</div></section>}

      <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Последние заказы с промокодом</h2></div><div className="divide-y divide-border">{data.recentPromoOrders.map((order) => <Link key={order.id} href={`/admin/orders?search=${encodeURIComponent(order.id)}`} className="flex flex-col justify-between gap-2 px-5 py-3 hover:bg-muted/40 sm:flex-row sm:items-center"><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-xs text-muted-foreground">{order.id}</span><span className="text-sm">{order.email}</span></div><div className="flex flex-wrap items-center gap-4 text-sm"><span className="font-mono font-semibold text-primary">{order.promoCode}</span><span>{formatEur(order.total)}</span><span className="font-medium text-red-600 dark:text-red-400">−{formatEur(order.discount)}</span><time className="text-xs text-muted-foreground" dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString('ru-RU')}</time></div></Link>)}</div></section>
    </>}
  </main></AdminGate>
}

function Metric({ label, value, hint, accent = 'text-foreground' }: { label: string; value: string; hint: string; accent?: string }): React.ReactElement {
  return <div className="rounded-xl border border-border bg-card p-5"><p className="mb-1 text-xs text-muted-foreground">{label}</p><p className={`text-2xl font-bold sm:text-3xl ${accent}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>
}

function EmptyAnalytics({ totalOrders }: { totalOrders: number }): React.ReactElement {
  return <div className="space-y-6">
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Основные показатели">
      <Metric label="Заказов с промокодом" value="0" hint={`0% из ${totalOrders} заказов`} />
      <Metric label="Выручка с промокодами" value={formatEur(0)} hint="Здесь появится средний чек" />
      <Metric label="Предоставлено скидок" value={formatEur(0)} hint="Здесь появится доля от выручки" accent="text-primary" />
      <Metric label="Средняя скидка" value="0,0%" hint="от суммы товаров до скидки" />
    </section>

    <section className="rounded-xl border border-primary/20 bg-primary/5 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div><h2 className="font-semibold text-foreground">Данных за выбранный период пока нет</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">После первого неотменённого заказа с промокодом страница автоматически покажет выручку, стоимость скидок и эффективность каждого кода.</p></div>
      <Link href="/admin/marketing/discounts" className="mt-4 inline-flex shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:mt-0">Создать или проверить промокод</Link>
    </section>

    <section className="grid gap-4 md:grid-cols-3" aria-label="Что появится в отчёте">
      <PreviewCard title="Сравнение промокодов" description="Заказы, выручка, сумма скидок и средний чек по каждому коду." example="WELCOME10 · 24 заказа · €1 840" />
      <PreviewCard title="Категории товаров" description="Какие категории чаще покупают со скидкой и как между ними распределяется бюджет." example="Волосы · 48 ед. · €126 скидки" />
      <PreviewCard title="Последние применения" description="Заказ, покупатель, применённый код, итоговая сумма и размер скидки." example="#ORDER · SAVE15 · −€12,40" />
    </section>

    <p className="text-xs text-muted-foreground">В отчёт не входят отменённые заказы. Переключите период выше, если промокоды использовались раньше.</p>
  </div>
}

function PreviewCard({ title, description, example }: { title: string; description: string; example: string }): React.ReactElement {
  return <article className="rounded-xl border border-dashed border-border bg-card p-5"><p className="text-xs font-medium uppercase tracking-wide text-primary">Будет в отчёте</p><h3 className="mt-2 font-semibold text-foreground">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p><div className="mt-4 rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground" aria-label="Пример данных">{example}</div></article>
}
