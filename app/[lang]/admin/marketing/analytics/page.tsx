'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { useAdminLocale } from '@/lib/use-admin-locale'

type Period = '7d' | '30d' | '90d' | 'all'

type Analytics = {
  period: Period; totalWithPromo: number; totalOrders: number; totalDiscounts: number; promoRevenue: number
  avgDiscountPercent: number; promoOrderShare: number; discountToRevenue: number
  codeStats: { code: string; count: number; totalDiscount: number; revenue: number; avgOrder: number }[]
  categoryStats: { cat: string; count: number; totalDiscount: number }[]
  recentPromoOrders: { id: string; email: string; promoCode: string; discount: number; total: number; createdAt: string }[]
}

export default function AdminMarketingAnalyticsPage(): React.ReactElement {
  const { language, locale, l } = useAdminLocale()
  const formatEur = useCallback((amount: number): string => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount), [locale])
  const periods: { value: Period; label: string }[] = [
    { value: '7d', label: l('7 дней', '7 days', '7 dienas') },
    { value: '30d', label: l('30 дней', '30 days', '30 dienas') },
    { value: '90d', label: l('90 дней', '90 days', '90 dienas') },
    { value: 'all', label: l('Всё время', 'All time', 'Viss periods') },
  ]
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
  const categories = useMemo(() => {
    const labels: Record<string, string> = {
      hair: l('Волосы', 'Hair', 'Mati'), face: l('Лицо', 'Face', 'Seja'),
      body: l('Тело', 'Body', 'Ķermenis'), nails: l('Ногти', 'Nails', 'Nagi'),
      equipment: l('Аксессуары и инструменты', 'Accessories and tools', 'Aksesuāri un instrumenti'),
      unknown: l('Без категории', 'Uncategorized', 'Bez kategorijas'),
    }
    return data?.categoryStats.map((row) => ({ ...row, label: labels[row.cat] ?? row.cat })) ?? []
  }, [data, l])

  return <AdminGate><main className="w-full space-y-6 py-4">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href="/admin" className="mb-1 inline-block text-sm text-primary hover:underline">← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Link><h1 className="text-2xl font-bold text-foreground">{l('Аналитика продвижения', 'Marketing analytics', 'Mārketinga analītika')}</h1><p className="mt-1 text-sm text-muted-foreground">{l('Эффективность промокодов по неотменённым заказам', 'Promo code performance for non-cancelled orders', 'Promokodu efektivitāte neatceltajiem pasūtījumiem')}</p></div>
      <div className="flex rounded-lg border border-border bg-card p-1" aria-label={l('Период отчёта', 'Report period', 'Pārskata periods')}>
        {periods.map((item) => <button key={item.value} type="button" onClick={() => { if (item.value !== period) { setLoading(true); setError(false); setPeriod(item.value) } }} aria-pressed={period === item.value} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${period === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{item.label}</button>)}
      </div>
    </div>

    {loading ? <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground" role="status">{l('Загрузка отчёта…', 'Loading report…', 'Ielādē pārskatu…')}</div>
    : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/20"><p className="font-medium text-red-800 dark:text-red-300">{l('Не удалось загрузить аналитику', 'Failed to load analytics', 'Neizdevās ielādēt analītiku')}</p><p className="mt-1 text-sm text-red-700 dark:text-red-400">{l('Проверьте соединение и попробуйте снова.', 'Check your connection and try again.', 'Pārbaudiet savienojumu un mēģiniet vēlreiz.')}</p><button type="button" onClick={() => { setLoading(true); setError(false); setReloadKey((key) => key + 1) }} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">{l('Повторить', 'Retry', 'Mēģināt vēlreiz')}</button></div>
    : !data || data.totalWithPromo === 0 ? <EmptyAnalytics totalOrders={data?.totalOrders ?? 0} l={l} formatEur={formatEur} />
    : <>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label={l('Основные показатели', 'Key metrics', 'Galvenie rādītāji')}>
        <Metric label={l('Заказов с промокодом', 'Orders with a promo code', 'Pasūtījumi ar promokodu')} value={String(data.totalWithPromo)} hint={l(`${data.promoOrderShare.toFixed(1)}% из ${data.totalOrders} заказов`, `${data.promoOrderShare.toFixed(1)}% of ${data.totalOrders} orders`, `${data.promoOrderShare.toFixed(1)}% no ${data.totalOrders} pasūtījumiem`)} />
        <Metric label={l('Выручка с промокодами', 'Promo code revenue', 'Ieņēmumi ar promokodiem')} value={formatEur(data.promoRevenue)} hint={l(`Средний чек ${formatEur(data.promoRevenue / data.totalWithPromo)}`, `Average order ${formatEur(data.promoRevenue / data.totalWithPromo)}`, `Vidējais pasūtījums ${formatEur(data.promoRevenue / data.totalWithPromo)}`)} />
        <Metric label={l('Предоставлено скидок', 'Discounts granted', 'Piešķirtās atlaides')} value={formatEur(data.totalDiscounts)} hint={l(`${data.discountToRevenue.toFixed(1)}% от выручки`, `${data.discountToRevenue.toFixed(1)}% of revenue`, `${data.discountToRevenue.toFixed(1)}% no ieņēmumiem`)} accent="text-primary" />
        <Metric label={l('Средняя скидка', 'Average discount', 'Vidējā atlaide')} value={`${data.avgDiscountPercent.toFixed(1)}%`} hint={l('от суммы товаров до скидки', 'of the product total before discount', 'no preču summas pirms atlaides')} />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">{l('Эффективность промокодов', 'Promo code performance', 'Promokodu efektivitāte')}</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-muted/50 text-left text-xs text-muted-foreground"><th className="px-5 py-3 font-medium">{l('Код', 'Code', 'Kods')}</th><th className="px-5 py-3 font-medium">{l('Заказы', 'Orders', 'Pasūtījumi')}</th><th className="px-5 py-3 font-medium">{l('Выручка', 'Revenue', 'Ieņēmumi')}</th><th className="px-5 py-3 font-medium">{l('Скидки', 'Discounts', 'Atlaides')}</th><th className="px-5 py-3 font-medium">{l('Средний чек', 'Average order', 'Vidējais pasūtījums')}</th></tr></thead><tbody className="divide-y divide-border">{data.codeStats.map((row) => <tr key={row.code} className="hover:bg-muted/40"><td className="px-5 py-3 font-mono font-semibold">{row.code}</td><td className="px-5 py-3">{row.count}</td><td className="px-5 py-3 font-medium text-emerald-600 dark:text-emerald-400">{formatEur(row.revenue)}</td><td className="px-5 py-3 text-primary">{formatEur(row.totalDiscount)}</td><td className="px-5 py-3">{formatEur(row.avgOrder)}</td></tr>)}</tbody></table></div></section>

      {categories.length > 0 && <section className="rounded-xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">{l('Товары со скидкой по категориям', 'Discounted products by category', 'Preces ar atlaidi pa kategorijām')}</h2></div><div className="space-y-3 p-5">{categories.map((row) => { const max = categories[0]?.count || 1; return <div key={row.cat}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="font-medium">{row.label}</span><span className="text-muted-foreground">{l(`${row.count} ед. · ${formatEur(row.totalDiscount)} скидки`, `${row.count} items · ${formatEur(row.totalDiscount)} discount`, `${row.count} vien. · ${formatEur(row.totalDiscount)} atlaide`)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(row.count / max * 100)}%` }} /></div></div>})}</div></section>}

      <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">{l('Последние заказы с промокодом', 'Latest orders with promo codes', 'Jaunākie pasūtījumi ar promokodiem')}</h2></div><div className="divide-y divide-border">{data.recentPromoOrders.map((order) => <Link key={order.id} href={`/admin/orders?search=${encodeURIComponent(order.id)}`} className="flex flex-col justify-between gap-2 px-5 py-3 hover:bg-muted/40 sm:flex-row sm:items-center"><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-xs text-muted-foreground">{order.id}</span><span className="text-sm">{order.email}</span></div><div className="flex flex-wrap items-center gap-4 text-sm"><span className="font-mono font-semibold text-primary">{order.promoCode}</span><span>{formatEur(order.total)}</span><span className="font-medium text-red-600 dark:text-red-400">−{formatEur(order.discount)}</span><time className="text-xs text-muted-foreground" dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US')}</time></div></Link>)}</div></section>
    </>}
  </main></AdminGate>
}

function Metric({ label, value, hint, accent = 'text-foreground' }: { label: string; value: string; hint: string; accent?: string }): React.ReactElement {
  return <div className="rounded-xl border border-border bg-card p-5"><p className="mb-1 text-xs text-muted-foreground">{label}</p><p className={`text-2xl font-bold sm:text-3xl ${accent}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>
}

type Localize = (ru: string, en: string, lv: string) => string

function EmptyAnalytics({ totalOrders, l, formatEur }: { totalOrders: number; l: Localize; formatEur: (amount: number) => string }): React.ReactElement {
  return <div className="space-y-6">
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label={l('Основные показатели', 'Key metrics', 'Galvenie rādītāji')}>
      <Metric label={l('Заказов с промокодом', 'Orders with a promo code', 'Pasūtījumi ar promokodu')} value="0" hint={l(`0% из ${totalOrders} заказов`, `0% of ${totalOrders} orders`, `0% no ${totalOrders} pasūtījumiem`)} />
      <Metric label={l('Выручка с промокодами', 'Promo code revenue', 'Ieņēmumi ar promokodiem')} value={formatEur(0)} hint={l('Здесь появится средний чек', 'The average order will appear here', 'Šeit tiks parādīts vidējais pasūtījums')} />
      <Metric label={l('Предоставлено скидок', 'Discounts granted', 'Piešķirtās atlaides')} value={formatEur(0)} hint={l('Здесь появится доля от выручки', 'The share of revenue will appear here', 'Šeit tiks parādīta ieņēmumu daļa')} accent="text-primary" />
      <Metric label={l('Средняя скидка', 'Average discount', 'Vidējā atlaide')} value="0.0%" hint={l('от суммы товаров до скидки', 'of the product total before discount', 'no preču summas pirms atlaides')} />
    </section>

    <section className="rounded-xl border border-primary/20 bg-primary/5 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div><h2 className="font-semibold text-foreground">{l('Данных за выбранный период пока нет', 'No data for the selected period yet', 'Izvēlētajam periodam vēl nav datu')}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{l('После первого неотменённого заказа с промокодом страница автоматически покажет выручку, стоимость скидок и эффективность каждого кода.', 'After the first non-cancelled order with a promo code, this page will show revenue, discount costs, and the performance of each code.', 'Pēc pirmā neatceltā pasūtījuma ar promokodu šajā lapā tiks parādīti ieņēmumi, atlaižu izmaksas un katra koda efektivitāte.')}</p></div>
      <Link href="/admin/marketing/discounts" className="mt-4 inline-flex shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:mt-0">{l('Создать или проверить промокод', 'Create or review a promo code', 'Izveidot vai pārbaudīt promokodu')}</Link>
    </section>

    <section className="grid gap-4 md:grid-cols-3" aria-label={l('Что появится в отчёте', 'What the report will include', 'Kas būs redzams pārskatā')}>
      <PreviewCard badge={l('Будет в отчёте', 'Included in report', 'Būs pārskatā')} exampleLabel={l('Пример данных', 'Sample data', 'Datu piemērs')} title={l('Сравнение промокодов', 'Promo code comparison', 'Promokodu salīdzinājums')} description={l('Заказы, выручка, сумма скидок и средний чек по каждому коду.', 'Orders, revenue, total discounts, and average order value for each code.', 'Pasūtījumi, ieņēmumi, atlaižu summa un vidējā pasūtījuma vērtība katram kodam.')} example={l('WELCOME10 · 24 заказа · €1 840', 'WELCOME10 · 24 orders · €1,840', 'WELCOME10 · 24 pasūtījumi · 1 840 €')} />
      <PreviewCard badge={l('Будет в отчёте', 'Included in report', 'Būs pārskatā')} exampleLabel={l('Пример данных', 'Sample data', 'Datu piemērs')} title={l('Категории товаров', 'Product categories', 'Preču kategorijas')} description={l('Какие категории чаще покупают со скидкой и как между ними распределяется бюджет.', 'Which categories are most often purchased at a discount and how the budget is distributed.', 'Kuras kategorijas visbiežāk iegādājas ar atlaidi un kā tiek sadalīts budžets.')} example={l('Волосы · 48 ед. · €126 скидки', 'Hair · 48 items · €126 discount', 'Mati · 48 vien. · 126 € atlaide')} />
      <PreviewCard badge={l('Будет в отчёте', 'Included in report', 'Būs pārskatā')} exampleLabel={l('Пример данных', 'Sample data', 'Datu piemērs')} title={l('Последние применения', 'Latest uses', 'Jaunākie lietojumi')} description={l('Заказ, покупатель, применённый код, итоговая сумма и размер скидки.', 'Order, customer, applied code, final total, and discount amount.', 'Pasūtījums, klients, izmantotais kods, gala summa un atlaides apmērs.')} example="#ORDER · SAVE15 · −€12.40" />
    </section>

    <p className="text-xs text-muted-foreground">{l('В отчёт не входят отменённые заказы. Переключите период выше, если промокоды использовались раньше.', 'Cancelled orders are excluded. Change the period above if promo codes were used earlier.', 'Atceltie pasūtījumi pārskatā nav iekļauti. Mainiet periodu augstāk, ja promokodi tika izmantoti agrāk.')}</p>
  </div>
}

function PreviewCard({ title, description, example, badge, exampleLabel }: { title: string; description: string; example: string; badge: string; exampleLabel: string }): React.ReactElement {
  return <article className="rounded-xl border border-dashed border-border bg-card p-5"><p className="text-xs font-medium uppercase tracking-wide text-primary">{badge}</p><h3 className="mt-2 font-semibold text-foreground">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p><div className="mt-4 rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground" aria-label={exampleLabel}>{example}</div></article>
}
