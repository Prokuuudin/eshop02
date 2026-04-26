'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Activity, ClipboardList, CreditCard, FileText, MapPinned, Package, RadioTower, ShieldCheck, ShoppingBag, UserCircle2 } from 'lucide-react'
import { getCurrentUser, logout, type User } from '@/lib/auth'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore } from '@/lib/admin-store'
import { useCart } from '@/lib/cart-store'
import { useSavedAddresses, type SavedAddress } from '@/lib/saved-addresses-store'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import B2BChat from '@/components/B2BChat'
import AccountAddressCard from '@/components/account/AccountAddressCard'
import AccountOrderCard from '@/components/account/AccountOrderCard'
import AccountPageHero from '@/components/account/AccountPageHero'

const SAVED_ADDRESS_MIGRATION_KEY = 'saved-addresses-migration-v1'
type OrderFilter = 'all' | 'active' | 'completed'

export default function AccountPage() {
  const router = useRouter()
  const { t, language } = useTranslation()
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const ordersStore = useOrders()
  const { getOrderStatus } = useAdminStore()
  const { replaceWithItems } = useCart()
  const { getByEmail, replaceForEmail, upsertForEmail, deleteForEmail } = useSavedAddresses()
  const allOrders = ordersStore.orders
  const locale = getLocaleFromLanguage(language)
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [addressDraft, setAddressDraft] = useState<SavedAddress | null>(null)
  const [editAddressErrors, setEditAddressErrors] = useState<Record<string, string>>({})
  const [isAddingAddress, setIsAddingAddress] = useState(false)
  const [newAddressDraft, setNewAddressDraft] = useState<SavedAddress | null>(null)
  const [newAddressErrors, setNewAddressErrors] = useState<Record<string, string>>({})
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all')

  useEffect(() => {
    const currentUser = getCurrentUser()
    if (!currentUser) {
      setLoading(false)
      router.push('/auth/login')
      return
    }
    setUser(currentUser)
    setLoading(false)
  }, [router])

  const userOrders = allOrders.filter((o) => o.email === user?.email)

  const savedAddresses = user?.email ? getByEmail(user.email) : []
  const totalSpent = userOrders.reduce((sum, order) => sum + order.total, 0)
  const activeOrdersCount = userOrders.filter((order) => {
    const status = getOrderStatus(order.id)
    return status !== 'delivered' && status !== 'cancelled'
  }).length
  const isAdmin = user?.platformRole === 'admin'
  const completedOrdersCount = userOrders.length - activeOrdersCount
  const accountTools = [
    {
      title: tl('account.page.tools.analytics.title', 'Статистика покупок', 'Purchase analytics', 'Pirkumu statistika'),
      description: tl('account.page.tools.analytics.description', 'Просмотр аналитики и динамики заказов', 'View analytics and order dynamics', 'Analitikas un pasutijumu dinamikas parskats'),
      href: '/account/analytics',
      linkLabel: tl('account.page.tools.analytics.linkLabel', 'Просмотр аналитики', 'View analytics', 'Skatit analitiku'),
      icon: Activity,
      classes: 'border-indigo-100 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-900/30',
      linkClasses: 'text-indigo-700 dark:text-indigo-300'
    },
    ...(user?.companyId
      ? [
          {
            title: tl('account.page.tools.invoices.title', 'Счёта организации', 'Company invoices', 'Uznemuma rekini'),
            description: tl('account.page.tools.invoices.description', 'Документы и платежный статус по компании', 'Company documents and payment status', 'Uznemuma dokumenti un maksajumu statuss'),
            href: '/account/invoices',
            linkLabel: tl('account.page.tools.invoices.linkLabel', 'Перейти к счётам', 'Go to invoices', 'Pariet uz rekiniem'),
            icon: FileText,
            classes: 'border-blue-100 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/30',
            linkClasses: 'text-blue-700 dark:text-blue-300'
          },
          {
            title: tl('account.page.tools.audit.title', 'История действий', 'Activity log', 'Darbibu vesture'),
            description: tl('account.page.tools.audit.description', 'Проверка действий пользователей и изменений', 'Review user actions and changes', 'Lietotaju darbibu un izmainu parbaude'),
            href: '/account/audit-logs',
            linkLabel: tl('account.page.tools.audit.linkLabel', 'Просмотр логов', 'View logs', 'Skatit zurnalus'),
            icon: ShieldCheck,
            classes: 'border-violet-100 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/30',
            linkClasses: 'text-violet-700 dark:text-violet-300'
          },
          {
            title: tl('account.page.tools.webhooks.title', 'Webhook-интеграции', 'Webhook integrations', 'Webhook integracijas'),
            description: tl('account.page.tools.webhooks.description', 'Настройка уведомлений и внешних интеграций', 'Configure notifications and external integrations', 'Pazinojumu un arejo integraciju iestatisana'),
            href: '/account/integrations/webhooks',
            linkLabel: tl('account.page.tools.webhooks.linkLabel', 'Управление webhook', 'Manage webhooks', 'Parvaldit webhook'),
            icon: RadioTower,
            classes: 'border-emerald-100 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30',
            linkClasses: 'text-emerald-700 dark:text-emerald-300'
          },
          {
            title: tl('account.page.tools.rfq.title', 'Запрос спецпредложения (RFQ)', 'Special offer request (RFQ)', 'Ipaso piedavajumu pieprasijums (RFQ)'),
            description: tl('account.page.tools.rfq.description', 'Отправка запроса на персональные условия', 'Submit a request for custom terms', 'Nosutit pieprasijumu personalizetiem noteikumiem'),
            href: '/request-quote',
            linkLabel: tl('account.page.tools.rfq.linkLabel', 'Создать RFQ заявку', 'Create RFQ request', 'Izveidot RFQ pieprasijumu'),
            icon: CreditCard,
            classes: 'border-amber-100 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30',
            linkClasses: 'text-amber-700 dark:text-amber-300'
          }
        ]
      : [])
  ]
  const summaryCards = [
    {
      title: t('account.myOrders'),
      value: String(userOrders.length),
      caption: tl('account.page.summary.totalOrders', 'Всего заказов', 'Total orders', 'Kopa pasutijumu'),
      icon: ShoppingBag
    },
    {
      title: tl('account.page.summary.activeTitle', 'Активные', 'Active', 'Aktivi'),
      value: String(activeOrdersCount),
      caption: tl('account.page.summary.activeCaption', 'В работе сейчас', 'Currently in progress', 'Paslaik apstrade'),
      icon: ClipboardList
    },
    {
      title: tl('account.page.summary.addressesTitle', 'Адреса', 'Addresses', 'Adreses'),
      value: String(savedAddresses.length),
      caption: tl('account.page.summary.addressesCaption', 'Сохранено адресов', 'Saved addresses', 'Saglabatas adreses'),
      icon: MapPinned
    },
    {
      title: tl('account.page.summary.turnoverTitle', 'Оборот', 'Turnover', 'Apgrozijums'),
      value: formatEuro(totalSpent, locale),
      caption: tl('account.page.summary.turnoverCaption', 'Сумма всех заказов', 'Total amount of all orders', 'Visu pasutijumu kopsumma'),
      icon: Package
    }
  ]
  const filteredOrders = userOrders.filter((order) => {
    const status = getOrderStatus(order.id)
    if (orderFilter === 'active') return status !== 'delivered' && status !== 'cancelled'
    if (orderFilter === 'completed') return status === 'delivered' || status === 'cancelled'
    return true
  })
  const getOrderFilterButtonClasses = (filter: OrderFilter): string => {
    const baseClass = 'flex-1 rounded-xl px-3 py-2 text-sm transition md:flex-none'

    if (orderFilter !== filter) {
      return `${baseClass} text-gray-600 dark:text-gray-300`
    }

    if (filter === 'active') {
      return `${baseClass} bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800`
    }

    if (filter === 'completed') {
      return `${baseClass} bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800`
    }

    return `${baseClass} bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100`
  }

  useEffect(() => {
    if (!user?.email) return

    let migratedEmails = new Set<string>()
    try {
      const raw = localStorage.getItem(SAVED_ADDRESS_MIGRATION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as string[]
        if (Array.isArray(parsed)) {
          migratedEmails = new Set(parsed)
        }
      }
    } catch {
      migratedEmails = new Set<string>()
    }

    if (migratedEmails.has(user.email)) return

    const existing = getByEmail(user.email)
    if (existing.length > 0) {
      migratedEmails.add(user.email)
      try {
        localStorage.setItem(SAVED_ADDRESS_MIGRATION_KEY, JSON.stringify(Array.from(migratedEmails)))
      } catch {
        // no-op: storage might be unavailable
      }
      return
    }

    const existingSignatureSet = new Set(
      existing.map((item) => `${item.firstName}|${item.lastName}|${item.phone}|${item.address}|${item.city}|${item.postalCode ?? ''}`)
    )

    const migratedFromOrders: SavedAddress[] = userOrders
      .map((order) => ({
        id: `addr_${order.id}`,
        firstName: order.firstName,
        lastName: order.lastName,
        email: order.email,
        phone: order.phone,
        address: order.address,
        city: order.city,
        postalCode: order.postalCode
      }))
      .filter((item) => {
        const signature = `${item.firstName}|${item.lastName}|${item.phone}|${item.address}|${item.city}|${item.postalCode ?? ''}`
        return !existingSignatureSet.has(signature)
      })

    if (migratedFromOrders.length > 0) {
      replaceForEmail(user.email, [...existing, ...migratedFromOrders])
    }

    migratedEmails.add(user.email)
    try {
      localStorage.setItem(SAVED_ADDRESS_MIGRATION_KEY, JSON.stringify(Array.from(migratedEmails)))
    } catch {
      // no-op: storage might be unavailable
    }
  }, [user?.email, userOrders, getByEmail, replaceForEmail])

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  const handleRepeatOrder = (orderId: string): void => {
    const order = userOrders.find((item) => item.id === orderId)
    if (!order) return
    replaceWithItems(order.items)
    router.push('/cart')
  }

  const getStatusLabel = (status: string): string => {
    if (status === 'confirmed') return t('order.status.confirmed')
    if (status === 'shipped') return t('order.status.shipped')
    if (status === 'delivered') return t('order.status.delivered')
    if (status === 'cancelled') return t('order.status.cancelled')
    return t('order.status.pending')
  }

  const getStatusClasses = (status: string): string => {
    if (status === 'confirmed') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
    if (status === 'shipped') return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
    if (status === 'delivered') return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200'
    if (status === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200'
  }

  const buildCheckoutAddressLink = (address: SavedAddress): string => {
    if (!address) return '/checkout'

    const params = new URLSearchParams({
      firstName: address.firstName,
      lastName: address.lastName,
      email: address.email,
      phone: address.phone,
      address: address.address,
      city: address.city,
      postalCode: address.postalCode ?? ''
    })

    return `/checkout?${params.toString()}`
  }

  const startEditingAddress = (address: SavedAddress): void => {
    setEditingAddressId(address.id)
    setAddressDraft({ ...address })
    setEditAddressErrors({})
  }

  const cancelEditingAddress = (): void => {
    setEditingAddressId(null)
    setAddressDraft(null)
    setEditAddressErrors({})
  }

  const validateAddress = (draft: SavedAddress): Record<string, string> => {
    const errors: Record<string, string> = {}
    if (!draft.firstName.trim()) errors.firstName = t('checkout.errors.firstName')
    if (!draft.lastName.trim()) errors.lastName = t('checkout.errors.lastName')
    if (!draft.phone.trim()) errors.phone = t('checkout.errors.phone')
    if (!draft.address.trim()) errors.address = t('checkout.errors.address')
    if (!draft.city.trim()) errors.city = t('checkout.errors.city')
    return errors
  }

  const saveEditingAddress = (): void => {
    if (!user?.email || !addressDraft) return

    const validationErrors = validateAddress(addressDraft)
    if (Object.keys(validationErrors).length > 0) {
      setEditAddressErrors(validationErrors)
      return
    }

    upsertForEmail(user.email, addressDraft)
    cancelEditingAddress()
  }

  const startAddingAddress = (): void => {
    if (!user?.email) return

    setIsAddingAddress(true)
    setEditingAddressId(null)
    setAddressDraft(null)
    setNewAddressDraft({
      id: `addr_manual_${Date.now()}`,
      firstName: user.name ?? '',
      lastName: '',
      email: user.email,
      phone: '',
      address: '',
      city: '',
      postalCode: ''
    })
    setNewAddressErrors({})
  }

  const cancelAddingAddress = (): void => {
    setIsAddingAddress(false)
    setNewAddressDraft(null)
    setNewAddressErrors({})
  }

  const saveNewAddress = (): void => {
    if (!user?.email || !newAddressDraft) return

    const validationErrors = validateAddress(newAddressDraft)
    if (Object.keys(validationErrors).length > 0) {
      setNewAddressErrors(validationErrors)
      return
    }

    upsertForEmail(user.email, newAddressDraft)
    cancelAddingAddress()
  }

  const getDeliveryLabel = (deliveryMethod: string): string => {
    if (deliveryMethod === 'courier') return t('account.deliveryCourier')
    if (deliveryMethod === 'pickup') return t('account.deliveryPickup')
    return t('account.deliveryPost')
  }

  if (loading) {
    return (
      <main className="w-full px-4 py-12">
        <p className="text-gray-600 dark:text-gray-300">{t('common.loading')}</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="w-full px-4 py-12">
        <p className="text-gray-600 dark:text-gray-300">{t('account.authRequired')}</p>
      </main>
    )
  }

  return (
    <main className="w-full px-4 py-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Профиль */}
          <aside className="xl:col-span-4">
            <div className="sticky top-4 space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <div className="mb-6 flex items-center gap-4 text-left">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                    <UserCircle2 className="h-8 w-8" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold text-gray-900 dark:text-gray-100">{user.name || t('account.userDefault')}</h2>
                    <p className="mt-1 break-all text-sm text-gray-600 dark:text-gray-300">{user.email}</p>
                  </div>
                </div>

                <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <div className="text-sm">
                    <p className="text-gray-600 dark:text-gray-300">{t('account.idLabel')}</p>
                    <p className="break-all font-mono text-xs text-gray-900 dark:text-gray-100">{user.id}</p>
                  </div>

                  <div className="text-sm">
                    <p className="text-gray-600 dark:text-gray-300">{tl('account.page.profileLabel', 'Профиль', 'Profile', 'Profils')}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {user.companyName
                        ? tl('account.page.corporateAccount', 'Корпоративный аккаунт', 'Corporate account', 'Korporativais konts')
                        : tl('account.page.personalAccount', 'Личный аккаунт', 'Personal account', 'Personigais konts')}
                    </p>
                    {user.companyName && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">{user.companyName}</p>
                    )}
                  </div>

                  {user.companyId && (
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 dark:border-cyan-800 dark:bg-cyan-900/30">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{tl('account.page.managerCard.title', 'Ваш аккаунт-менеджер', 'Your account manager', 'Jusu konta menedzeris')}</p>
                      <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{tl('account.page.managerCard.name', 'Анна Петрова', 'Anna Petrova', 'Anna Petrova')}</p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{tl('account.page.managerCard.phoneLabel', 'Телефон', 'Phone', 'Talrunis')}: +7 (999) 123-45-67</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">Email: account.manager@eshop02.local</p>
                    </div>
                  )}

                  {user.platformRole === 'admin' && (
                    <Link href="/admin" className="block">
                      <Button className="w-full bg-rose-600 text-white hover:bg-rose-700" size="sm">
                        {tl('account.page.goToAdmin', 'Перейти в панель администратора', 'Go to admin panel', 'Doties uz admin paneli')}
                      </Button>
                    </Link>
                  )}
                </div>

                <Button onClick={handleLogout} variant="outline" className="mt-6 w-full">
                  {t('account.logout')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
              {summaryCards.map((card) => {
                const Icon = card.icon

                return (
                  <div key={card.title} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{card.title}</p>
                        <p className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">{card.value}</p>
                      </div>
                      <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">{card.caption}</p>
                  </div>
                )
              })}
            </div>
          </aside>

          <div className="space-y-6 xl:col-span-8">
            <AccountPageHero
              eyebrow="Dashboard"
              title={t('account.title')}
              description={tl('account.page.heroDescription', 'Управляйте заказами, адресами и рабочими инструментами из одного экрана без длинной прокрутки.', 'Manage orders, addresses, and work tools from one screen without long scrolling.', 'Parvaldiet pasutijumus, adreses un darba rikus viena ekrana bez garas ritinasanas.')}
              icon={ShoppingBag}
            />

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {accountTools.map((tool) => (
                <div key={tool.href} className={`rounded-2xl border p-5 shadow-sm ${tool.classes}`}>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-gray-700 shadow-sm dark:bg-gray-950/40 dark:text-gray-200">
                    <tool.icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{tool.title}</p>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{tool.description}</p>
                  <Link href={tool.href} className={`mt-4 inline-block text-sm font-medium hover:underline ${tool.linkClasses}`}>
                    {tool.linkLabel}
                  </Link>
                </div>
              ))}
            </section>

            {!isAdmin && (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('account.savedAddressesTitle')}</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{tl('account.page.savedAddressesHint', 'Быстрый выбор адресов для повторного оформления заказа.', 'Quick address selection for repeat checkout.', 'Atra adresu izvele atkartotai pasutisanas noformesanai.')}</p>
                </div>
                {!isAddingAddress && (
                  <button className="text-sm text-indigo-600 dark:text-indigo-300" onClick={startAddingAddress}>
                    {t('account.addAddress')}
                  </button>
                )}
              </div>

                {isAddingAddress && newAddressDraft && (
                  <div className="mb-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      className={`w-full rounded border px-2 py-1 text-xs ${newAddressErrors.firstName ? 'border-red-500' : ''}`}
                      value={newAddressDraft.firstName}
                      onChange={(e) => {
                        setNewAddressDraft({ ...newAddressDraft, firstName: e.target.value })
                        if (newAddressErrors.firstName) {
                          setNewAddressErrors((prev) => {
                            const next = { ...prev }
                            delete next.firstName
                            return next
                          })
                        }
                      }}
                      placeholder={t('checkout.firstName')}
                    />
                    {newAddressErrors.firstName && <p className="text-red-600 text-xs">{newAddressErrors.firstName}</p>}
                    <input
                      className={`w-full rounded border px-2 py-1 text-xs ${newAddressErrors.lastName ? 'border-red-500' : ''}`}
                      value={newAddressDraft.lastName}
                      onChange={(e) => {
                        setNewAddressDraft({ ...newAddressDraft, lastName: e.target.value })
                        if (newAddressErrors.lastName) {
                          setNewAddressErrors((prev) => {
                            const next = { ...prev }
                            delete next.lastName
                            return next
                          })
                        }
                      }}
                      placeholder={t('checkout.lastName')}
                    />
                    {newAddressErrors.lastName && <p className="text-red-600 text-xs">{newAddressErrors.lastName}</p>}
                    <input
                      className={`w-full rounded border px-2 py-1 text-xs ${newAddressErrors.phone ? 'border-red-500' : ''}`}
                      value={newAddressDraft.phone}
                      onChange={(e) => {
                        setNewAddressDraft({ ...newAddressDraft, phone: e.target.value })
                        if (newAddressErrors.phone) {
                          setNewAddressErrors((prev) => {
                            const next = { ...prev }
                            delete next.phone
                            return next
                          })
                        }
                      }}
                      placeholder={t('checkout.phone')}
                    />
                    {newAddressErrors.phone && <p className="text-red-600 text-xs">{newAddressErrors.phone}</p>}
                    <input
                      className={`w-full rounded border px-2 py-1 text-xs ${newAddressErrors.address ? 'border-red-500' : ''}`}
                      value={newAddressDraft.address}
                      onChange={(e) => {
                        setNewAddressDraft({ ...newAddressDraft, address: e.target.value })
                        if (newAddressErrors.address) {
                          setNewAddressErrors((prev) => {
                            const next = { ...prev }
                            delete next.address
                            return next
                          })
                        }
                      }}
                      placeholder={t('checkout.address')}
                    />
                    {newAddressErrors.address && <p className="text-red-600 text-xs">{newAddressErrors.address}</p>}
                    <input
                      className={`w-full rounded border px-2 py-1 text-xs ${newAddressErrors.city ? 'border-red-500' : ''}`}
                      value={newAddressDraft.city}
                      onChange={(e) => {
                        setNewAddressDraft({ ...newAddressDraft, city: e.target.value })
                        if (newAddressErrors.city) {
                          setNewAddressErrors((prev) => {
                            const next = { ...prev }
                            delete next.city
                            return next
                          })
                        }
                      }}
                      placeholder={t('checkout.city')}
                    />
                    {newAddressErrors.city && <p className="text-red-600 text-xs">{newAddressErrors.city}</p>}
                    <input
                      className="w-full rounded border px-2 py-1 text-xs"
                      value={newAddressDraft.postalCode ?? ''}
                      onChange={(e) => setNewAddressDraft({ ...newAddressDraft, postalCode: e.target.value })}
                      placeholder={t('checkout.postalCode')}
                    />
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={cancelAddingAddress}>
                        {t('common.cancel')}
                      </Button>
                      <Button size="sm" onClick={saveNewAddress}>
                        {t('common.save')}
                      </Button>
                    </div>
                  </div>
                )}

                {savedAddresses.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {savedAddresses.slice(0, 5).map((addressItem) => (
                      <AccountAddressCard
                        key={addressItem.id}
                        addressItem={addressItem}
                        isEditing={editingAddressId === addressItem.id}
                        draft={editingAddressId === addressItem.id ? addressDraft : null}
                        errors={editAddressErrors}
                        checkoutHref={buildCheckoutAddressLink(addressItem)}
                        labels={{
                          firstName: t('checkout.firstName'),
                          lastName: t('checkout.lastName'),
                          phone: t('checkout.phone'),
                          address: t('checkout.address'),
                          city: t('checkout.city'),
                          postalCode: t('checkout.postalCode'),
                          postalCodeLabel: t('order.postalCode'),
                          useAddress: t('account.useAddress'),
                          editAddress: t('account.editAddress'),
                          deleteAddress: t('account.deleteAddress'),
                          cancel: t('common.cancel'),
                          save: t('common.save'),
                          confirmTitle: t('confirm.title'),
                          confirmDeleteAddress: t('account.confirmDeleteAddress'),
                          delete: t('common.delete')
                        }}
                        onDraftChange={(field, value) => {
                          if (!addressDraft) return
                          setAddressDraft({ ...addressDraft, [field]: value })
                          if (editAddressErrors[field]) {
                            setEditAddressErrors((prev) => {
                              const next = { ...prev }
                              delete next[field]
                              return next
                            })
                          }
                        }}
                        onCancel={cancelEditingAddress}
                        onSave={saveEditingAddress}
                        onStartEdit={() => startEditingAddress(addressItem)}
                        onDelete={() => user?.email && deleteForEmail(user.email, addressItem.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-300">{t('account.noSavedAddresses')}</p>
                )}
            </section>
            )}

            {!isAdmin && (
            <section id="orders-history" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-6">
              <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('account.myOrders')}</h2>
                <div className="inline-flex w-full rounded-2xl bg-gray-100 p-1 dark:bg-gray-800 md:w-auto">
                  <button
                    type="button"
                    className={getOrderFilterButtonClasses('all')}
                    onClick={() => setOrderFilter('all')}
                  >
                    {tl('account.page.ordersFilter.allWithCount', 'Все ({count})', 'All ({count})', 'Visi ({count})', { count: userOrders.length })}
                  </button>
                  <button
                    type="button"
                    className={getOrderFilterButtonClasses('active')}
                    onClick={() => setOrderFilter('active')}
                  >
                    {tl('account.page.ordersFilter.activeWithCount', 'Активные ({count})', 'Active ({count})', 'Aktivie ({count})', { count: activeOrdersCount })}
                  </button>
                  <button
                    type="button"
                    className={getOrderFilterButtonClasses('completed')}
                    onClick={() => setOrderFilter('completed')}
                  >
                    {tl('account.page.ordersFilter.completedWithCount', 'Завершённые ({count})', 'Completed ({count})', 'Pabeigtie ({count})', { count: completedOrdersCount })}
                  </button>
                </div>
              </div>

              {userOrders.length > 0 ? (
                filteredOrders.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {filteredOrders.map((order) => (
                    <AccountOrderCard
                      key={order.id}
                      order={order}
                      statusLabel={getStatusLabel(getOrderStatus(order.id))}
                      statusClasses={getStatusClasses(getOrderStatus(order.id))}
                      locale={locale}
                      itemsUnit={t('account.itemsUnit')}
                      deliveryLabel={getDeliveryLabel(order.deliveryMethod)}
                      promoCodeLabel={t('account.promoCode')}
                      bonusSpentLabel={t('account.bonus.spent')}
                      bonusEarnedLabel={t('account.bonus.earned')}
                      repeatOrderLabel={t('account.repeatOrder')}
                      detailsLabel={t('account.details')}
                      onRepeatOrder={() => handleRepeatOrder(order.id)}
                    />
                  ))}
                </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-300">{tl('account.page.noOrdersForFilter', 'Для выбранного фильтра заказов пока нет.', 'There are no orders for the selected filter yet.', 'Izveletajam filtram vel nav pasutijumu.')}</p>
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-300 mb-4">{t('account.noOrders')}</p>
                  <Link href="/catalog">
                    <Button>{t('account.startShopping')}</Button>
                  </Link>
                </div>
              )}
            </section>
            )}
          </div>
        </div>
      </div>

      {user.companyId && <B2BChat />}
    </main>
  )
}
