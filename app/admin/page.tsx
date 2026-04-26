'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore, type OrderStatus } from '@/lib/admin-store'
import { Button } from '@/components/ui/button'
import { formatDate, formatEuro } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { getAdminAccessLevel, getCurrentUser, logout } from '@/lib/auth'

export default function AdminPage() {
  const router = useRouter()
  const { t, language } = useTranslation()
  const { orders } = useOrders()
  const { getOrderStatus, setOrderStatus, bonusProgram, updateBonusProgram } = useAdminStore()
  const [bonusDraft, setBonusDraft] = useState(bonusProgram)
  const [bonusSaved, setBonusSaved] = useState(false)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [accessLevel, setAccessLevel] = useState<'manager' | 'admin'>('manager')

  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0)
  const avgOrderValue = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0
  const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0)

  const statusColors: Record<OrderStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    shipped: 'bg-indigo-100 text-indigo-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  }

  const statusLabels: Record<OrderStatus, string> = {
    pending: t('order.status.pending'),
    confirmed: t('order.status.confirmed'),
    shipped: t('order.status.shipped'),
    delivered: t('order.status.delivered'),
    cancelled: t('order.status.cancelled')
  }

  const saveBonusProgram = (): void => {
    updateBonusProgram(bonusDraft)
    setBonusSaved(true)
    setTimeout(() => setBonusSaved(false), 1500)
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
          <Button
            variant="outline"
            onClick={() => {
              logout()
              router.push('/')
            }}
          >
            {t('auth.logout')}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">B2B RFQ</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{tl('admin.dashboard.cards.rfq.description', 'Управление заявками на спецпредложения', 'Manage special offer requests', 'Specialo piedavajumu pieprasijumu parvaldiba')}</p>
            <Link href="/admin/rfq">
              <Button variant="outline" size="sm">{tl('admin.dashboard.cards.rfq.open', 'Открыть RFQ панель', 'Open RFQ panel', 'Atvert RFQ paneli')}</Button>
            </Link>
          </div>
          {hasFullAccess && (
            <>
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{tl('admin.dashboard.cards.clientBarcodes.title', 'Клиентские баркоды', 'Client barcodes', 'Klientu barkodi')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{tl('admin.dashboard.cards.clientBarcodes.description', 'Выдача, редактирование и привязка баркодов компаний', 'Issue, edit and bind company barcodes', 'Uznemumu barkodu izsniegsana, redigesana un piesaiste')}</p>
                <Link href="/admin/client-barcodes">
                  <Button variant="outline" size="sm">{tl('admin.dashboard.cards.clientBarcodes.open', 'Открыть баркоды', 'Open barcodes', 'Atvert barkodus')}</Button>
                </Link>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">B2B Webhooks</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{tl('admin.dashboard.cards.webhooks.description', 'Проверка endpoint и истории доставок', 'Check endpoints and delivery history', 'Endpointu un piegazu vestures parbaude')}</p>
                <Link href="/account/integrations/webhooks">
                  <Button variant="outline" size="sm">{tl('admin.dashboard.cards.webhooks.open', 'Открыть Webhooks', 'Open Webhooks', 'Atvert Webhooks')}</Button>
                </Link>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{tl('admin.dashboard.cards.products.title', 'Товары', 'Products', 'Produkti')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{tl('admin.dashboard.cards.products.description', 'Редактирование цен и описаний, поиск по характеристикам', 'Edit prices/descriptions and search by attributes', 'Cenu/aprakstu redigesana un meklesana pec atributiem')}</p>
                <Link href="/admin/products">
                  <Button variant="outline" size="sm">{tl('admin.dashboard.cards.products.open', 'Открыть товары', 'Open products', 'Atvert produktus')}</Button>
                </Link>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{tl('admin.dashboard.cards.blog.title', 'Блог', 'Blog', 'Blogs')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{tl('admin.dashboard.cards.blog.description', 'Создание, редактирование и удаление статей', 'Create, edit, and delete articles', 'Rakstu izveide, redigesana un dzesana')}</p>
                <Link href="/admin/blog">
                  <Button variant="outline" size="sm">{tl('admin.dashboard.cards.blog.open', 'Открыть управление блогом', 'Open blog management', 'Atvert bloga parvaldibu')}</Button>
                </Link>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{tl('admin.dashboard.cards.content.title', 'Контент сайта', 'Site content', 'Vietnes saturs')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{tl('admin.dashboard.cards.content.description', 'Редактирование текстов и изображений без правки кода', 'Edit text and images without code changes', 'Tekstu un attelu redigesana bez koda izmainam')}</p>
                <Link href="/admin/content">
                  <Button variant="outline" size="sm">{tl('admin.dashboard.cards.content.open', 'Открыть контент-панель', 'Open content panel', 'Atvert satura paneli')}</Button>
                </Link>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{tl('admin.dashboard.cards.reviews.title', 'Отзывы', 'Reviews', 'Atsauksmes')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{tl('admin.dashboard.cards.reviews.description', 'Просмотр, скрытие и модерация пользовательских отзывов', 'View, hide and moderate user reviews', 'Lietotaju atsauksmju skatisana, slegsana un moderacija')}</p>
                <Link href="/admin/reviews">
                  <Button variant="outline" size="sm">{tl('admin.dashboard.cards.reviews.open', 'Открыть модерацию отзывов', 'Open reviews moderation', 'Atvert atsauksmju moderaciju')}</Button>
                </Link>
              </div>
            </>
          )}
        </div>

        {!hasFullAccess && (
          <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            {tl(
              'admin.dashboard.managerNotice',
              'Для роли менеджера доступны только заказы, статистика и RFQ. Разделы управления контентом и аккаунтами доступны администратору.',
              'Managers can access only orders, statistics, and RFQ. Content and account management sections are available to administrators.',
              'Menedzeriem pieejami tikai pasutijumi, statistika un RFQ. Satura un kontu parvaldibas sadalas ir pieejamas administratoriem.'
            )}
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-gray-600 dark:text-gray-300 text-sm">📦 {t('admin.stats.totalOrders')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{orders.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-gray-600 dark:text-gray-300 text-sm">💰 {t('admin.stats.totalRevenue')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{formatEuro(totalRevenue, locale)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-gray-600 dark:text-gray-300 text-sm">💵 {t('admin.stats.averageOrder')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{formatEuro(avgOrderValue, locale)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
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
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{t('admin.products')}</p>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-sm space-y-1">
                            {order.items.map((item) => (
                              <p key={item.id}>
                                {item.title} × {item.quantity} = {formatEuro(item.price * item.quantity, locale)}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          {(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map((s) => (
                            <Button
                              key={s}
                              onClick={() => setOrderStatus(order.id, s)}
                              variant={status === s ? 'default' : 'outline'}
                              size="sm"
                              className={status === s ? 'bg-indigo-600' : ''}
                            >
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

        {hasFullAccess && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('admin.bonus.title')}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm">
                <span className="block text-gray-600 dark:text-gray-300 mb-1">{t('admin.bonus.enabled')}</span>
                <select
                  value={bonusDraft.enabled ? 'yes' : 'no'}
                  onChange={(e) => setBonusDraft((prev) => ({ ...prev, enabled: e.target.value === 'yes' }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                >
                  <option value="yes">{t('common.yes')}</option>
                  <option value="no">{t('common.no')}</option>
                </select>
              </label>

              <label className="text-sm">
                <span className="block text-gray-600 dark:text-gray-300 mb-1">{t('admin.bonus.earnRate')}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={bonusDraft.earnRatePercent}
                  onChange={(e) => setBonusDraft((prev) => ({ ...prev, earnRatePercent: Number(e.target.value) }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600 dark:text-gray-300 mb-1">{t('admin.bonus.maxSpend')}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={bonusDraft.maxSpendPercent}
                  onChange={(e) => setBonusDraft((prev) => ({ ...prev, maxSpendPercent: Number(e.target.value) }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600 dark:text-gray-300 mb-1">{t('admin.bonus.minOrderForEarn')}</span>
                <input
                  type="number"
                  min={0}
                  value={bonusDraft.minOrderForEarn}
                  onChange={(e) => setBonusDraft((prev) => ({ ...prev, minOrderForEarn: Number(e.target.value) }))}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={saveBonusProgram}>{t('common.save')}</Button>
              {bonusSaved && <span className="text-sm text-green-700">{t('admin.bonus.saved')}</span>}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
