'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const SELECT_CLASS =
  'w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm'

interface DeliveryMethod {
  enabled: boolean
  price: number
  freeFrom: number
  label: string
}

interface PaymentMethod {
  enabled: boolean
  label: string
}

interface ShippingSettings {
  delivery: Record<string, DeliveryMethod>
  payment: Record<string, PaymentMethod>
}

const DELIVERY_KEYS = ['courier', 'pickup', 'post'] as const
const PAYMENT_KEYS = ['card', 'cash', 'online', 'invoice'] as const

const DELIVERY_NAMES: Record<string, string> = {
  courier: 'Курьер',
  pickup: 'Самовывоз',
  post: 'Почта',
}

const PAYMENT_NAMES: Record<string, string> = {
  card: 'Банковская карта',
  cash: 'Наличные',
  online: 'Онлайн (Stripe)',
  invoice: 'По счёту (B2B)',
}

const DEFAULT_SETTINGS: ShippingSettings = {
  delivery: {
    courier: { enabled: true, price: 5.99, freeFrom: 50, label: 'Курьер' },
    pickup: { enabled: true, price: 0, freeFrom: 0, label: 'Самовывоз' },
    post: { enabled: true, price: 3.99, freeFrom: 30, label: 'Почта' },
  },
  payment: {
    card: { enabled: true, label: 'Банковская карта' },
    cash: { enabled: true, label: 'Наличные' },
    online: { enabled: true, label: 'Онлайн (Stripe)' },
    invoice: { enabled: false, label: 'По счёту (B2B)' },
  },
}

export default function AdminShippingPage() {
  const [settings, setSettings] = React.useState<ShippingSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState<{ text: string; ok: boolean } | null>(null)

  React.useEffect(() => {
    fetch('/api/admin/shipping')
      .then((r) => r.json())
      .then((data: ShippingSettings) => {
        setSettings(data)
      })
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => setLoading(false))
  }, [])

  const updateDelivery = (key: string, field: keyof DeliveryMethod, value: string | boolean | number) => {
    setSettings((prev) => ({
      ...prev,
      delivery: {
        ...prev.delivery,
        [key]: {
          ...prev.delivery[key],
          [field]: value,
        },
      },
    }))
  }

  const updatePayment = (key: string, field: keyof PaymentMethod, value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      payment: {
        ...prev.payment,
        [key]: {
          ...prev.payment[key],
          [field]: value,
        },
      },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('server_error')
      setMessage({ text: 'Настройки сохранены', ok: true })
    } catch {
      setMessage({ text: 'Не удалось сохранить настройки', ok: false })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 4000)
    }
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Доставка и оплата
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Управляйте доступными способами доставки и оплаты.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              message.ok
                ? 'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                : 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : (
          <>
            {/* Delivery */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Способы доставки</h2>

              <div className="space-y-4">
                {DELIVERY_KEYS.map((key) => {
                  const method = settings.delivery[key]
                  if (!method) return null
                  return (
                    <div
                      key={key}
                      className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3"
                    >
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {DELIVERY_NAMES[key] ?? key}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Статус
                          </label>
                          <select
                            className={SELECT_CLASS}
                            value={method.enabled ? 'yes' : 'no'}
                            onChange={(e) => updateDelivery(key, 'enabled', e.target.value === 'yes')}
                          >
                            <option value="yes">Включён</option>
                            <option value="no">Отключён</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Название
                          </label>
                          <Input
                            value={method.label}
                            onChange={(e) => updateDelivery(key, 'label', e.target.value)}
                            placeholder="Название"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Цена (€)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={method.price}
                            onChange={(e) => updateDelivery(key, 'price', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Бесплатно от (€)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={method.freeFrom}
                            onChange={(e) => updateDelivery(key, 'freeFrom', parseFloat(e.target.value) || 0)}
                            placeholder="0 — всегда платно"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Payment */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Способы оплаты</h2>

              <div className="space-y-3">
                {PAYMENT_KEYS.map((key) => {
                  const method = settings.payment[key]
                  if (!method) return null
                  return (
                    <div
                      key={key}
                      className="rounded-md border border-gray-200 dark:border-gray-700 p-3"
                    >
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
                        {PAYMENT_NAMES[key] ?? key}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Статус
                          </label>
                          <select
                            className={SELECT_CLASS}
                            value={method.enabled ? 'yes' : 'no'}
                            onChange={(e) => updatePayment(key, 'enabled', e.target.value === 'yes')}
                          >
                            <option value="yes">Включён</option>
                            <option value="no">Отключён</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Название
                          </label>
                          <Input
                            value={method.label}
                            onChange={(e) => updatePayment(key, 'label', e.target.value)}
                            placeholder="Название"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </Button>
            </div>
          </>
        )}
      </main>
    </AdminGate>
  )
}
