'use client'
import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore, type OrderStatus } from '@/lib/admin-store'
import { Button } from '@/components/ui/button'
import { formatDate, formatEuro } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { getAdminAccessLevel, getCurrentUser } from '@/lib/auth'

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

  useEffect(() => {
    const syncAccessLevel = () => {
      const level = getAdminAccessLevel(getCurrentUser())
      setAccessLevel(level === 'admin' ? 'admin' : 'manager')
    }
    syncAccessLevel()
    window.addEventListener('eshop-user-changed', syncAccessLevel as EventListener)
    return () => window.removeEventListener('eshop-user-changed', syncAccessLevel as EventListener)
  }, [])

  const hasFullAccess = accessLevel === 'admin'

  const ALL_CARDS: CardDef[] = [
    { id: 'orders',     href: '/admin/orders',                adminOnly: false, bg: 'bg-blue-50 dark:bg-blue-950/20',    border: 'border-l-blue-500',    title: tl('admin.dashboard.cards.orders.title', 'Заказы', 'Orders', 'Pasutijumi'), description: tl('admin.dashboard.cards.orders.description', 'Управление заказами, статусами и оплатой', 'Manage orders, statuses and payments', 'Pasutijumu, statusu un maksajumu parvaldiba'), linkText: tl('admin.dashboard.cards.orders.open', 'Открыть заказы', 'Open orders', 'Atvert pasutijumus') },
    { id: 'rfq',        href: '/admin/rfq',                   adminOnly: false, bg: 'bg-indigo-50 dark:bg-indigo-950/20', border: 'border-l-indigo-500',  title: 'B2B RFQ',                            description: tl('admin.dashboard.cards.rfq.description', 'Управление заявками на спецпредложения', 'Manage special offer requests', 'Specialo piedavajumu pieprasijumu parvaldiba'), linkText: tl('admin.dashboard.cards.rfq.open', 'Открыть RFQ панель', 'Open RFQ panel', 'Atvert RFQ paneli') },
    { id: 'barcodes',   href: '/admin/client-barcodes',       adminOnly: true,  bg: 'bg-cyan-50 dark:bg-cyan-950/20',    border: 'border-l-cyan-500',    title: tl('admin.dashboard.cards.clientBarcodes.title', 'Клиентские баркоды', 'Client barcodes', 'Klientu barkodi'), description: tl('admin.dashboard.cards.clientBarcodes.description', 'Выдача, редактирование и привязка баркодов компаний', 'Issue, edit and bind company barcodes', 'Uznemumu barkodu izsniegsana, redigesana un piesaiste'), linkText: tl('admin.dashboard.cards.clientBarcodes.open', 'Открыть баркоды', 'Open barcodes', 'Atvert barkodus') },
    { id: 'webhooks',   href: '/account/integrations/webhooks', adminOnly: true, bg: 'bg-violet-50 dark:bg-violet-950/20', border: 'border-l-violet-500', title: 'B2B Webhooks',                       description: tl('admin.dashboard.cards.webhooks.description', 'Проверка endpoint и истории доставок', 'Check endpoints and delivery history', 'Endpointu un piegazu vestures parbaude'), linkText: tl('admin.dashboard.cards.webhooks.open', 'Открыть Webhooks', 'Open Webhooks', 'Atvert Webhooks') },
    { id: 'products',   href: '/admin/products',              adminOnly: true,  bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-l-emerald-500', title: tl('admin.dashboard.cards.products.title', 'Товары', 'Products', 'Produkti'), description: tl('admin.dashboard.cards.products.description', 'Редактирование цен и описаний, поиск по характеристикам', 'Edit prices/descriptions and search by attributes', 'Cenu/aprakstu redigesana un meklesana pec atributiem'), linkText: tl('admin.dashboard.cards.products.open', 'Открыть товары', 'Open products', 'Atvert produktus') },
    { id: 'blog',       href: '/admin/blog',                  adminOnly: true,  bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-l-orange-500', title: tl('admin.dashboard.cards.blog.title', 'Блог', 'Blog', 'Blogs'), description: tl('admin.dashboard.cards.blog.description', 'Создание, редактирование и удаление статей', 'Create, edit, and delete articles', 'Rakstu izveide, redigesana un dzesana'), linkText: tl('admin.dashboard.cards.blog.open', 'Открыть управление блогом', 'Open blog management', 'Atvert bloga parvaldibu') },
    { id: 'content',    href: '/admin/content',               adminOnly: true,  bg: 'bg-amber-50 dark:bg-amber-950/20',  border: 'border-l-amber-500',  title: tl('admin.dashboard.cards.content.title', 'Контент сайта', 'Site content', 'Vietnes saturs'), description: tl('admin.dashboard.cards.content.description', 'Редактирование текстов и изображений без правки кода', 'Edit text and images without code changes', 'Tekstu un attelu redigesana bez koda izmainam'), linkText: tl('admin.dashboard.cards.content.open', 'Открыть контент-панель', 'Open content panel', 'Atvert satura paneli') },
    { id: 'banners',    href: '/admin/content/banners',       adminOnly: true,  bg: 'bg-yellow-50 dark:bg-yellow-950/20', border: 'border-l-yellow-500', title: 'Баннеры и блоки',                    description: 'Управление промо-баннерами и контентными блоками главной страницы', linkText: 'Открыть' },
    { id: 'design',     href: '/admin/design-system',         adminOnly: true,  bg: 'bg-slate-100 dark:bg-slate-800/40', border: 'border-l-slate-400',  title: 'Design System',                      description: 'Визуальный справочник токенов, компонентов и паттернов проекта', linkText: 'Открыть' },
    { id: 'reviews',    href: '/admin/reviews',               adminOnly: true,  bg: 'bg-pink-50 dark:bg-pink-950/20',    border: 'border-l-pink-500',   title: tl('admin.dashboard.cards.reviews.title', 'Отзывы', 'Reviews', 'Atsauksmes'), description: tl('admin.dashboard.cards.reviews.description', 'Просмотр, скрытие и модерация пользовательских отзывов', 'View, hide and moderate user reviews', 'Lietotaju atsauksmju skatisana, slegsana un moderacija'), linkText: tl('admin.dashboard.cards.reviews.open', 'Открыть модерацию отзывов', 'Open reviews moderation', 'Atvert atsauksmju moderaciju') },
    { id: 'discounts',  href: '/admin/marketing/discounts',   adminOnly: true,  bg: 'bg-red-50 dark:bg-red-950/20',      border: 'border-l-red-500',    title: 'Скидки и купоны',                    description: 'Управление промокодами: создание, редактирование, статистика использования', linkText: 'Открыть' },
    { id: 'campaigns',  href: '/admin/marketing/campaigns',   adminOnly: true,  bg: 'bg-purple-50 dark:bg-purple-950/20', border: 'border-l-purple-500', title: 'Промо-кампании',                     description: 'Создание и управление маркетинговыми кампаниями по категориям товаров', linkText: 'Открыть' },
    { id: 'showcases',  href: '/admin/marketing/showcases',   adminOnly: true,  bg: 'bg-teal-50 dark:bg-teal-950/20',    border: 'border-l-teal-500',   title: 'Подборки и витрины',                 description: 'Тематические подборки товаров для витрин и спецстраниц', linkText: 'Открыть' },
    { id: 'promo-analytics', href: '/admin/marketing/analytics', adminOnly: true, bg: 'bg-rose-50 dark:bg-rose-950/20',  border: 'border-l-rose-500',   title: 'Аналитика промо',                    description: 'Статистика использования промокодов, конверсия и эффективность скидок', linkText: 'Открыть' },
    { id: 'bonus',      href: '/admin/bonus',                 adminOnly: true,  bg: 'bg-green-50 dark:bg-green-950/20',  border: 'border-l-green-500',  title: t('admin.bonus.title'),               description: tl('admin.dashboard.cards.bonus.description', 'Настройка начисления и списания бонусных баллов', 'Bonus points earn and spend settings', 'Bonusu punktu uzkrasanas un tereesanas iestatijumi'), linkText: tl('admin.dashboard.cards.bonus.open', 'Открыть бонусную программу', 'Open bonus program', 'Atvert bonus programmu') },
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
    <main className="w-full px-4 py-12 text-gray-900 dark:text-gray-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('admin.dashboard')}</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {hasFullAccess
                ? tl('admin.dashboard.accessFull', 'Полный доступ администратора', 'Full administrator access', 'Pilna administratora piekluve')
                : tl('admin.dashboard.accessPartial', 'Частичный доступ менеджера', 'Partial manager access', 'Daleja menedzera piekluve')}
            </p>
          </div>
          {hasFullAccess && (
            <div className="flex items-center gap-2">
              {editMode && (
                <Button variant="outline" size="sm" onClick={() => { resetCardOrder(); setEditMode(false) }}>
                  Сбросить порядок
                </Button>
              )}
              <Button variant={editMode ? 'default' : 'outline'} size="sm" onClick={() => setEditMode((v) => !v)}>
                {editMode ? 'Готово' : 'Настроить панель'}
              </Button>
            </div>
          )}
        </div>

        {editMode && (
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Перетащите плашки в нужном порядке. Нажмите «Готово» когда закончите.
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
                  'group flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 p-5 shadow-sm transition-all',
                  card.bg, card.border,
                  editMode
                    ? 'cursor-grab active:cursor-grabbing select-none'
                    : 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600',
                  isOver ? 'ring-2 ring-indigo-400 ring-offset-1 scale-[1.02]' : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{card.title}</p>
                  {editMode && (
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5 shrink-0 text-lg leading-none">⠿</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-snug">{card.description}</p>
                {!editMode && (
                  <Link href={card.href} className="mt-auto">
                    <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline">
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
          <div className="group flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
            <p className="text-gray-600 dark:text-gray-300 text-sm">📦 {t('admin.stats.totalOrders')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{orders.length}</p>
          </div>
          <div className="group flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
            <p className="text-gray-600 dark:text-gray-300 text-sm">💰 {t('admin.stats.totalRevenue')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{formatEuro(totalRevenue, locale)}</p>
          </div>
          <div className="group flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
            <p className="text-gray-600 dark:text-gray-300 text-sm">💵 {t('admin.stats.averageOrder')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{formatEuro(avgOrderValue, locale)}</p>
          </div>
          <div className="group flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
            <p className="text-gray-600 dark:text-gray-300 text-sm">📋 {t('admin.stats.itemsSold')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{totalItems}</p>
          </div>
        </div>

        {/* Orders Section */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">{t('admin.orders')}</h2>
          {orders.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {orders.map((order) => {
                const status = getOrderStatus(order.id)
                const isExpanded = expandedOrder === order.id
                return (
                  <div key={order.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <button
                      type="button"
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      aria-expanded={isExpanded}
                      className="w-full text-left cursor-pointer flex justify-between items-start"
                    >
                      <div className="flex-1">
                        <p className="font-mono text-sm text-gray-600 dark:text-gray-300">{order.id}</p>
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
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('admin.deliveryAddress')}</p>
                            <p className="text-sm mt-1">{order.address}, {order.city}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('checkout.delivery.method')}</p>
                            <p className="text-sm mt-1">
                              {order.deliveryMethod === 'courier' ? t('checkout.delivery.courier') : order.deliveryMethod === 'pickup' ? t('checkout.delivery.pickup') : t('checkout.delivery.post')}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('checkout.payment.title')}</p>
                            <p className="text-sm mt-1">{order.paymentMethod}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('admin.date')}</p>
                            <p className="text-sm mt-1">{formatDate(order.createdAt, locale)}</p>
                          </div>
                        </div>
                        <div className="mb-4">
                          <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{t('admin.products')}</p>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-sm space-y-1">
                            {order.items.map((item) => (
                              <p key={item.id}>{item.title} × {item.quantity} = {formatEuro(item.price * item.quantity, locale)}</p>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map((s) => (
                            <Button key={s} onClick={() => setOrderStatus(order.id, s)} variant={status === s ? 'default' : 'outline'} size="sm" className={status === s ? 'bg-indigo-600' : ''}>
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
            <p className="text-gray-600 dark:text-gray-300 text-center py-8">{t('admin.noOrders')}</p>
          )}
        </div>
      </div>
    </main>
  )
}
