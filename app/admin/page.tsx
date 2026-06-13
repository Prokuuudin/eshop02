'use client'
import React, { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore, type OrderStatus } from '@/lib/admin-store'
import { Button } from '@/components/ui/button'
import { formatDate, formatEuro } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { getAdminAccessLevel } from '@/lib/auth'
import { useAuthStore } from '@/lib/auth-store'

function RevenueBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const h = 140
  const barW = Math.max(8, Math.min(36, Math.floor(560 / Math.max(data.length, 1)) - 4))
  const gap = Math.max(2, Math.floor(560 / Math.max(data.length, 1)) - barW)
  const chartW = Math.max(560, data.length * (barW + gap) + 40)

  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={h + 48} className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = 8 + (h - 8) * (1 - frac)
          return (
            <g key={frac}>
              <line x1={32} x2={chartW - 8} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={28} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                {frac === 0 ? '0' : `€${Math.round(max * frac).toLocaleString('ru-RU')}`}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const barH = Math.max(2, (d.value / max) * (h - 16))
          const x = 32 + i * (barW + gap)
          const y = h - barH + 8
          return (
            <g key={i}>
              <title>€{d.value.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</title>
              <rect x={x} y={y} width={barW} height={barH} rx={3} fill="#6366f1" opacity={0.85} />
              <text
                x={x + barW / 2}
                y={h + 24}
                textAnchor="middle"
                fontSize={9}
                fill="#6b7280"
                transform={data.length > 10 ? `rotate(-35,${x + barW / 2},${h + 24})` : undefined}
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

type CardDef = {
  id: string
  href: string
  bg: string
  border: string
  adminOnly: boolean
  title: string
  description: string
  linkText: string
}

export default function AdminPage() {
  const { t, language } = useTranslation()
  const { orders } = useOrders()
  const { getOrderStatus, setOrderStatus, cardOrder, setCardOrder, resetCardOrder } = useAdminStore()
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [accessLevel, setAccessLevel] = useState<'manager' | 'admin'>('manager')
  const [editMode, setEditMode] = useState(false)
  const dragId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en)
  const tl = (key: string, ru: string, en: string, lv: string) => t(key, l(ru, en, lv))

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0)
  const avgOrderValue = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0
  const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0)

  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '90d'>('30d')

  const chartOrders = useMemo(() => {
    const days = chartPeriod === '7d' ? 7 : chartPeriod === '30d' ? 30 : 90
    const cutoff = Date.now() - days * 86400000
    return orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff)
  }, [orders, chartPeriod])

  const revenueByDay = useMemo(() => {
    const map = new Map<string, number>()
    chartOrders.forEach((o) => {
      const d = new Date(o.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
      map.set(d, (map.get(d) ?? 0) + (o.total ?? 0))
    })
    return Array.from(map.entries())
      .sort((a, b) => {
        const [da, ma] = a[0].split('.').map(Number)
        const [db, mb] = b[0].split('.').map(Number)
        return ma !== mb ? ma - mb : da - db
      })
      .map(([label, value]) => ({ label, value }))
  }, [chartOrders])

  const chartPeriodRevenue = chartOrders.reduce((s, o) => s + (o.total ?? 0), 0)

  const statusColors: Record<OrderStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
    confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    shipped: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
    delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  }

  const statusLabels: Record<OrderStatus, string> = {
    pending: t('order.status.pending'),
    confirmed: t('order.status.confirmed'),
    shipped: t('order.status.shipped'),
    delivered: t('order.status.delivered'),
    cancelled: t('order.status.cancelled'),
  }

  const currentUser = useAuthStore((s) => s.user)
  useEffect(() => {
    const level = getAdminAccessLevel(currentUser)
    setAccessLevel(level === 'admin' ? 'admin' : 'manager')
  }, [currentUser])

  const hasFullAccess = accessLevel === 'admin'

  const ALL_CARDS: CardDef[] = [
    { id: 'orders',     href: '/admin/orders',                adminOnly: false, bg: 'bg-blue-50 dark:bg-blue-950/20',    border: 'border-l-blue-500',    title: tl('admin.dashboard.cards.orders.title', 'Заказы', 'Orders', 'Pasutijumi'), description: tl('admin.dashboard.cards.orders.description', 'Управление заказами, статусами и оплатой', 'Manage orders, statuses and payments', 'Pasutijumu, statusu un maksajumu parvaldiba'), linkText: tl('admin.dashboard.cards.orders.open', 'Открыть заказы', 'Open orders', 'Atvert pasutijumus') },
    { id: 'rfq',        href: '/admin/rfq',                   adminOnly: false, bg: 'bg-indigo-50 dark:bg-indigo-950/20', border: 'border-l-indigo-500',  title: 'B2B RFQ',                            description: tl('admin.dashboard.cards.rfq.description', 'Управление заявками на спецпредложения', 'Manage special offer requests', 'Specialo piedavajumu pieprasijumu parvaldiba'), linkText: tl('admin.dashboard.cards.rfq.open', 'Открыть RFQ панель', 'Open RFQ panel', 'Atvert RFQ paneli') },
    { id: 'barcodes',   href: '/admin/client-barcodes',       adminOnly: true,  bg: 'bg-cyan-50 dark:bg-cyan-950/20',    border: 'border-l-cyan-500',    title: tl('admin.dashboard.cards.clientBarcodes.title', 'Карты клиентов', 'Client cards', 'Klientu kartes'), description: tl('admin.dashboard.cards.clientBarcodes.description', 'Выдача, редактирование и привязка карт клиентов', 'Issue, edit and bind client cards', 'Klientu karšu izsniegsana, redigesana un piesaiste'), linkText: tl('admin.dashboard.cards.clientBarcodes.open', 'Открыть карты клиентов', 'Open client cards', 'Atvert klientu kartes') },
    { id: 'webhooks',   href: '/account/integrations/webhooks', adminOnly: true, bg: 'bg-violet-50 dark:bg-violet-950/20', border: 'border-l-violet-500', title: 'B2B Webhooks',                       description: tl('admin.dashboard.cards.webhooks.description', 'Проверка endpoint и истории доставок', 'Check endpoints and delivery history', 'Endpointu un piegazu vestures parbaude'), linkText: tl('admin.dashboard.cards.webhooks.open', 'Открыть Webhooks', 'Open Webhooks', 'Atvert Webhooks') },
    { id: 'products',   href: '/admin/products',              adminOnly: true,  bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-l-emerald-500', title: tl('admin.dashboard.cards.products.title', 'Товары', 'Products', 'Produkti'), description: tl('admin.dashboard.cards.products.description', 'Редактирование цен и описаний, поиск по характеристикам', 'Edit prices/descriptions and search by attributes', 'Cenu/aprakstu redigesana un meklesana pec atributiem'), linkText: tl('admin.dashboard.cards.products.open', 'Открыть товары', 'Open products', 'Atvert produktus') },
    { id: 'blog',       href: '/admin/blog',                  adminOnly: true,  bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-l-orange-500', title: tl('admin.dashboard.cards.blog.title', 'Блог', 'Blog', 'Blogs'), description: tl('admin.dashboard.cards.blog.description', 'Создание, редактирование и удаление статей', 'Create, edit, and delete articles', 'Rakstu izveide, redigesana un dzesana'), linkText: tl('admin.dashboard.cards.blog.open', 'Открыть управление блогом', 'Open blog management', 'Atvert bloga parvaldibu') },
    { id: 'content',    href: '/admin/content',               adminOnly: true,  bg: 'bg-amber-50 dark:bg-amber-950/20',  border: 'border-l-amber-500',  title: tl('admin.dashboard.cards.content.title', 'Контент сайта', 'Site content', 'Vietnes saturs'), description: tl('admin.dashboard.cards.content.description', 'Редактирование текстов и изображений без правки кода', 'Edit text and images without code changes', 'Tekstu un attelu redigesana bez koda izmainam'), linkText: tl('admin.dashboard.cards.content.open', 'Открыть контент-панель', 'Open content panel', 'Atvert satura paneli') },
    { id: 'banners',    href: '/admin/content/banners',       adminOnly: true,  bg: 'bg-yellow-50 dark:bg-yellow-950/20', border: 'border-l-yellow-500', title: l('Баннеры и блоки', 'Banners & blocks', 'Baneri un bloki'), description: l('Управление промо-баннерами и контентными блоками главной страницы', 'Manage promo banners and content blocks on the homepage', 'Promo baneru un satura bloku parvaldiba'), linkText: l('Открыть', 'Open', 'Atvert') },
    { id: 'design',     href: '/admin/design-system',         adminOnly: true,  bg: 'bg-slate-100 dark:bg-slate-800/40', border: 'border-l-slate-400',  title: 'Design System',                      description: l('Визуальный справочник токенов, компонентов и паттернов проекта', 'Visual reference of tokens, components and patterns', 'Vizuala tokenu, komponentu un paraugu uzzinju gramata'), linkText: l('Открыть', 'Open', 'Atvert') },
    { id: 'reviews',    href: '/admin/reviews',               adminOnly: true,  bg: 'bg-pink-50 dark:bg-pink-950/20',    border: 'border-l-pink-500',   title: tl('admin.dashboard.cards.reviews.title', 'Отзывы', 'Reviews', 'Atsauksmes'), description: tl('admin.dashboard.cards.reviews.description', 'Просмотр, скрытие и модерация пользовательских отзывов', 'View, hide and moderate user reviews', 'Lietotaju atsauksmju skatisana, slegsana un moderacija'), linkText: tl('admin.dashboard.cards.reviews.open', 'Открыть модерацию отзывов', 'Open reviews moderation', 'Atvert atsauksmju moderaciju') },
    { id: 'discounts',  href: '/admin/marketing/discounts',   adminOnly: true,  bg: 'bg-red-50 dark:bg-red-950/20',      border: 'border-l-red-500',    title: l('Скидки и купоны', 'Discounts & coupons', 'Atlaides un kuponi'), description: l('Управление промокодами: создание, редактирование, статистика использования', 'Manage promo codes: create, edit, usage stats', 'Promokodu parvaldiba: izveide, redigesana, statistika'), linkText: l('Открыть', 'Open', 'Atvert') },
    { id: 'campaigns',  href: '/admin/marketing/campaigns',   adminOnly: true,  bg: 'bg-purple-50 dark:bg-purple-950/20', border: 'border-l-purple-500', title: l('Промо-кампании', 'Promo campaigns', 'Promo kampanas'), description: l('Создание и управление маркетинговыми кампаниями по категориям товаров', 'Create and manage marketing campaigns by product category', 'Marketinga kampanu izveide un parvaldiba pec produktu kategorijam'), linkText: l('Открыть', 'Open', 'Atvert') },
    { id: 'showcases',  href: '/admin/marketing/showcases',   adminOnly: true,  bg: 'bg-teal-50 dark:bg-teal-950/20',    border: 'border-l-teal-500',   title: l('Подборки и витрины', 'Showcases', 'Vitrinas'), description: l('Тематические подборки товаров для витрин и спецстраниц', 'Curated product collections for showcases and special pages', 'Tematiskas produktu izlases vitrinam un specialajam lapam'), linkText: l('Открыть', 'Open', 'Atvert') },
    { id: 'promo-analytics', href: '/admin/marketing/analytics', adminOnly: true, bg: 'bg-rose-50 dark:bg-rose-950/20',  border: 'border-l-rose-500',   title: l('Аналитика промо', 'Promo analytics', 'Promo analitika'), description: l('Статистика использования промокодов, конверсия и эффективность скидок', 'Promo code usage stats, conversion and discount effectiveness', 'Promokodu lietosanas statistika, konversija un atlaizu efektivitate'), linkText: l('Открыть', 'Open', 'Atvert') },
    { id: 'bonus',      href: '/admin/bonus',                 adminOnly: true,  bg: 'bg-green-50 dark:bg-green-950/20',  border: 'border-l-green-500',  title: t('admin.bonus.title'),               description: tl('admin.dashboard.cards.bonus.description', 'Настройка начисления и списания бонусных баллов', 'Bonus points earn and spend settings', 'Bonusu punktu uzkrasanas un tereesanas iestatijumi'), linkText: tl('admin.dashboard.cards.bonus.open', 'Открыть бонусную программу', 'Open bonus program', 'Atvert bonus programmu') },
    { id: 'breakdown',  href: '/admin/sales/breakdown',       adminOnly: true,  bg: 'bg-sky-50 dark:bg-sky-950/20',      border: 'border-l-sky-500',    title: l('Аналитика: товары', 'Product analytics', 'Produktu analitika'), description: l('Топ-10 товаров, топ бренды, динамика выручки по категориям', 'Top products, top brands, revenue by category', 'Top produkti, top zimi, ienemumi pec kategorijam'), linkText: l('Открыть', 'Open', 'Atvert') },
    { id: 'analytics',  href: '/admin/analytics',             adminOnly: true,  bg: 'bg-violet-50 dark:bg-violet-950/20', border: 'border-l-violet-500', title: l('ABC / Когорты / SEO', 'ABC / Cohorts / SEO', 'ABC / Kohortas / SEO'), description: l('ABC-анализ товаров, когортный retention клиентов, SEO-пробелы каталога', 'Product ABC analysis, cohort retention, catalog SEO gaps', 'ABC analitika, kohortu retencija, SEO trukumi'), linkText: l('Открыть', 'Open', 'Atvert') },
    { id: 'notifications-broadcast', href: '/admin/notifications/send', adminOnly: true, bg: 'bg-indigo-50 dark:bg-indigo-950/20', border: 'border-l-indigo-400', title: l('Рассылка уведомлений', 'Notification Broadcast', 'Pazinojumu izplatisana'), description: l('Отправка уведомлений выбранным пользователям в кабинет, email или оба канала', 'Send notifications to selected users via in-cabinet, email, or both channels', 'Nosutiet pazinojumus izveletajiem lietotajiem kabineta, e-pasta vai abos kanalos'), linkText: l('Открыть рассылку', 'Open broadcast', 'Atvert izplatisanu') },
  ]

  const visibleCards = ALL_CARDS.filter((c) => !c.adminOnly || hasFullAccess)
  const defaultOrder = visibleCards.map((c) => c.id)
  const orderedIds = cardOrder ?? defaultOrder
  const sortedCards = [
    ...orderedIds.map((id) => visibleCards.find((c) => c.id === id)).filter(Boolean) as CardDef[],
    ...visibleCards.filter((c) => !orderedIds.includes(c.id)),
  ]

  const handleDragStart = (id: string) => { dragId.current = id }
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (dragId.current !== id) setDragOverId(id)
  }
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = dragId.current
    if (!sourceId || sourceId === targetId) { setDragOverId(null); return }
    const ids = sortedCards.map((c) => c.id)
    const from = ids.indexOf(sourceId)
    const to = ids.indexOf(targetId)
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, sourceId)
    setCardOrder(next)
    dragId.current = null
    setDragOverId(null)
  }
  const handleDragEnd = () => { dragId.current = null; setDragOverId(null) }

  return (
    <main className="w-full py-4 text-foreground">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('admin.dashboard')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFullAccess
                ? tl('admin.dashboard.accessFull', 'Полный доступ администратора', 'Full administrator access', 'Pilna administratora piekluve')
                : tl('admin.dashboard.accessPartial', 'Частичный доступ менеджера', 'Partial manager access', 'Daleja menedzera piekluve')}
            </p>
          </div>
          {hasFullAccess && (
            <div className="hidden sm:flex items-center gap-2">
              {editMode && (
                <Button variant="outline" size="sm" onClick={() => { resetCardOrder(); setEditMode(false) }}>
                  {l('Сбросить порядок', 'Reset order', 'Atiestatit kartibu')}
                </Button>
              )}
              <Button variant={editMode ? 'default' : 'outline'} size="sm" onClick={() => setEditMode((v) => !v)}>
                {editMode ? l('Готово', 'Done', 'Gatavs') : l('Настроить панель', 'Customize panel', 'Pielaqot paneli')}
              </Button>
            </div>
          )}
        </div>

        {editMode && (
          <p className="hidden sm:block mb-4 text-sm text-muted-foreground">
            {l(
              'Перетащите плашки в нужном порядке. Нажмите «Готово» когда закончите.',
              'Drag the cards into the desired order. Click "Done" when finished.',
              'Velciet kartes vajadzigaja kartiba. Nokliksiniet "Gatavs", kad esat pabeidzis.'
            )}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {sortedCards.map((card) => {
            const isOver = dragOverId === card.id
            return (
              <div
                key={card.id}
                draggable={editMode}
                onDragStart={() => handleDragStart(card.id)}
                onDragOver={(e) => editMode && handleDragOver(e, card.id)}
                onDrop={(e) => editMode && handleDrop(e, card.id)}
                onDragEnd={handleDragEnd}
                className={[
                  'group flex flex-col rounded-xl border border-border border-l-4 p-5 shadow-sm transition-all',
                  card.bg, card.border,
                  editMode
                    ? 'cursor-grab active:cursor-grabbing select-none'
                    : 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600',
                  isOver ? 'ring-2 ring-indigo-400 ring-offset-1 scale-[1.02]' : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-base font-semibold text-foreground">{card.title}</p>
                  {editMode && (
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0 text-lg leading-none">⠿</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-4 leading-snug">{card.description}</p>
                {!editMode && (
                  <Link href={card.href} className="mt-auto">
                    <span className="text-sm font-medium text-primary group-hover:underline">
                      {card.linkText} →
                    </span>
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        {!hasFullAccess && (
          <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            {tl('admin.dashboard.managerNotice', 'Для роли менеджера доступны только заказы, статистика и RFQ. Разделы управления контентом и аккаунтами доступны администратору.', 'Managers can access only orders, statistics, and RFQ. Content and account management sections are available to administrators.', 'Menedzeriem pieejami tikai pasutijumi, statistika un RFQ. Satura un kontu parvaldibas sadalas ir pieejamas administratoriem.')}
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
            <p className="text-muted-foreground text-sm">📦 {t('admin.stats.totalOrders')}</p>
            <p className="text-3xl font-bold mt-2 text-foreground">{orders.length}</p>
          </div>
          <div className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
            <p className="text-muted-foreground text-sm">💰 {t('admin.stats.totalRevenue')}</p>
            <p className="text-3xl font-bold mt-2 text-foreground">{formatEuro(totalRevenue, locale)}</p>
          </div>
          <div className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
            <p className="text-muted-foreground text-sm">💵 {t('admin.stats.averageOrder')}</p>
            <p className="text-3xl font-bold mt-2 text-foreground">{formatEuro(avgOrderValue, locale)}</p>
          </div>
          <div className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
            <p className="text-muted-foreground text-sm">📋 {t('admin.stats.itemsSold')}</p>
            <p className="text-3xl font-bold mt-2 text-foreground">{totalItems}</p>
          </div>
        </div>

        {/* Pending orders alert */}
        {(() => {
          const pendingCount = orders.filter((o) => getOrderStatus(o.id) === 'pending').length
          const confirmedCount = orders.filter((o) => getOrderStatus(o.id) === 'confirmed').length
          const total = pendingCount + confirmedCount
          if (total === 0) return null
          return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{total}</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {l(
                      total === 1 ? 'необработанный заказ' : total < 5 ? 'необработанных заказа' : 'необработанных заказов',
                      total === 1 ? 'unprocessed order' : 'unprocessed orders',
                      total === 1 ? 'neapstradats pasutijums' : 'neapstradati pasutijumi'
                    )}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {pendingCount > 0 && `${l('Новых', 'New', 'Jauni')}: ${pendingCount}`}
                    {pendingCount > 0 && confirmedCount > 0 && ' · '}
                    {confirmedCount > 0 && `${l('Подтверждённых', 'Confirmed', 'Apstiprinati')}: ${confirmedCount}`}
                  </p>
                </div>
              </div>
              <Link href="/admin/orders?status=pending">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                  {l('Обработать →', 'Process →', 'Apstradat →')}
                </Button>
              </Link>
            </div>
          )
        })()}

        {/* Revenue Chart */}
        <div className="hidden sm:block bg-card rounded-lg border border-border p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {l('Выручка', 'Revenue', 'Ienemumi')}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {l('За период', 'Period total', 'Perioda kopā')}:{' '}
                <span className="font-medium text-foreground">
                  {formatEuro(chartPeriodRevenue, locale)}
                </span>
                {' '}·{' '}
                {chartOrders.length}{' '}
                {l('заказов', 'orders', 'pasūtījumu')}
              </p>
            </div>
            <div className="flex gap-1">
              {(['7d', '30d', '90d'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setChartPeriod(p)}
                  className={[
                    'px-3 py-1 text-sm rounded-md transition-colors',
                    chartPeriod === p
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700',
                  ].join(' ')}
                >
                  {p === '7d' ? l('7 дней', '7 days', '7 dienas') : p === '30d' ? l('30 дней', '30 days', '30 dienas') : l('90 дней', '90 days', '90 dienas')}
                </button>
              ))}
            </div>
          </div>
          {revenueByDay.length > 0 ? (
            <RevenueBarChart data={revenueByDay} />
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
              {l('Нет заказов за выбранный период', 'No orders for selected period', 'Nav pasūtījumu izvēlētajam periodam')}
            </div>
          )}
        </div>

        {/* Orders Section */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-2xl font-bold mb-6 text-foreground">{t('admin.orders')}</h2>
          {orders.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {orders.map((order) => {
                const status = getOrderStatus(order.id)
                const isExpanded = expandedOrder === order.id
                return (
                  <div key={order.id} className="border border-border rounded-lg p-4">
                    <button
                      type="button"
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      aria-expanded={isExpanded}
                      className="w-full text-left cursor-pointer flex justify-between items-start"
                    >
                      <div className="flex-1">
                        <p className="font-mono text-sm text-muted-foreground">{order.id}</p>
                        <div className="flex gap-3 mt-2 text-sm">
                          <span>👤 {order.firstName} {order.lastName}</span>
                          <span>📧 {order.email}</span>
                          <span>💰 {formatEuro(order.total, locale)}</span>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded text-sm font-medium ${statusColors[status]}`}>
                        {statusLabels[status]}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">{t('admin.deliveryAddress')}</p>
                            <p className="text-sm mt-1">{order.address}, {order.city}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t('checkout.delivery.method')}</p>
                            <p className="text-sm mt-1">
                              {order.deliveryMethod === 'courier' ? t('checkout.delivery.courier') : order.deliveryMethod === 'pickup' ? t('checkout.delivery.pickup') : t('checkout.delivery.post')}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t('checkout.payment.title')}</p>
                            <p className="text-sm mt-1">{order.paymentMethod}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t('admin.date')}</p>
                            <p className="text-sm mt-1">{formatDate(order.createdAt, locale)}</p>
                          </div>
                        </div>
                        <div className="mb-4">
                          <p className="text-base font-semibold text-foreground mb-1">{t('admin.products')}</p>
                          <div className="bg-muted rounded p-2 text-sm space-y-1">
                            {order.items.map((item) => (
                              <p key={item.id}>{item.title} × {item.quantity} = {formatEuro(item.price * item.quantity, locale)}</p>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map((s) => (
                            <Button key={s} onClick={() => setOrderStatus(order.id, s)} variant={status === s ? 'default' : 'outline'} size="sm" className={status === s ? 'bg-primary' : ''}>
                              {statusLabels[s]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">{t('admin.noOrders')}</p>
          )}
        </div>
    </main>
  )
}
