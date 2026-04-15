'use client'

import React, { useMemo, useState } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast-context'

type WebhookEvent = 'order.created' | 'order.shipped' | 'order.cancelled' | 'payment.recorded' | 'invoice.issued'

type WebhookEndpoint = {
  id: string
  companyId: string
  url: string
  events: WebhookEvent[]
  isActive: boolean
  secret: string
  createdAt: string
}

type DeliveryAttempt = {
  endpointId: string
  attempt: number
  status: 'success' | 'failed'
  statusCode?: number
  error?: string
  durationMs: number
}

type DeliveryLog = {
  id: string
  companyId: string
  event: WebhookEvent
  payload: Record<string, unknown>
  createdAt: string
  attempts: DeliveryAttempt[]
}

const ALL_EVENTS: WebhookEvent[] = [
  'order.created',
  'order.shipped',
  'order.cancelled',
  'payment.recorded',
  'invoice.issued'
]

export default function WebhooksPage() {
  const user = getCurrentUser()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryLog[]>([])
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>(['order.created', 'payment.recorded'])

  const companyId = user?.companyId || ''
  const apiKey = 'b2b-demo-api-key-12345'

  const headers = useMemo(
    () => ({
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'x-company-id': companyId
    }),
    [apiKey, companyId]
  )

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const response = await fetch('/api/v1/webhooks', { headers: { 'x-api-key': apiKey, 'x-company-id': companyId } })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error || 'Не удалось загрузить webhook настройки')
      }

      setEndpoints(body.data.endpoints || [])
      setDeliveries(body.data.deliveries || [])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ошибка загрузки webhook', 'error')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    loadData()
  }, [companyId])

  const toggleEvent = (event: WebhookEvent) => {
    setSelectedEvents((prev) => {
      if (prev.includes(event)) {
        return prev.filter((item) => item !== event)
      }
      return [...prev, event]
    })
  }

  const addEndpoint = async () => {
    if (!url.trim()) {
      showToast('Укажите URL endpoint', 'error')
      return
    }

    if (selectedEvents.length === 0) {
      showToast('Выберите хотя бы одно событие', 'error')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: url.trim(),
          events: selectedEvents,
          testNow: true
        })
      })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error || 'Не удалось добавить endpoint')
      }

      showToast('Webhook endpoint добавлен', 'success')
      setUrl('')
      await loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ошибка создания endpoint', 'error')
    } finally {
      setLoading(false)
    }
  }

  const removeEndpoint = async (id: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/v1/webhooks?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey, 'x-company-id': companyId }
      })
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body.error || 'Не удалось удалить endpoint')
      }

      showToast('Webhook endpoint удалён', 'success')
      await loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ошибка удаления endpoint', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!companyId) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-10 text-center bg-gray-50 dark:bg-gray-800">
          <p className="text-lg text-gray-700 dark:text-gray-300">Интеграции доступны только для B2B-компаний</p>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Webhooks интеграции</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Компания: {companyId}</p>
      </div>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900 space-y-4">
        <h2 className="text-lg font-semibold">Добавить endpoint</h2>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {ALL_EVENTS.map((event) => {
            const active = selectedEvents.includes(event)
            return (
              <button
                key={event}
                type="button"
                onClick={() => toggleEvent(event)}
                className={`px-3 py-1 rounded text-xs border ${
                  active
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {event}
              </button>
            )
          })}
        </div>
        <Button onClick={addEndpoint} disabled={loading}>Добавить и протестировать</Button>
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
        <h2 className="text-lg font-semibold mb-3">Активные endpoints ({endpoints.length})</h2>
        <div className="space-y-3">
          {endpoints.map((item) => (
            <div key={item.id} className="rounded border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-sm break-all">{item.url}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{item.events.join(', ')}</p>
                </div>
                <Button variant="outline" onClick={() => removeEndpoint(item.id)} disabled={loading}>Удалить</Button>
              </div>
            </div>
          ))}
          {endpoints.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-400">Нет активных endpoint'ов</p>}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
        <h2 className="text-lg font-semibold mb-3">История доставок ({deliveries.length})</h2>
        <div className="space-y-3 max-h-[420px] overflow-y-auto">
          {deliveries.map((item) => {
            const ok = item.attempts.some((attempt) => attempt.status === 'success')
            return (
              <div key={item.id} className="rounded border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.event}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${ok ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                    {ok ? 'Доставлено' : 'Ошибка'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(item.createdAt).toLocaleString('ru-RU')}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Попыток: {item.attempts.length}</p>
              </div>
            )
          })}
          {deliveries.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-400">История пока пустая</p>}
        </div>
      </section>
    </main>
  )
}
