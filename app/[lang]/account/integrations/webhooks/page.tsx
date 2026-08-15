'use client'

import React, { useState } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast-context'

type ApiKeyMeta = { id: string; keyPrefix: string; createdAt: string; lastUsedAt: string | null }

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

export default function WebhooksPage(): React.ReactElement {
  const user = getCurrentUser()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryLog[]>([])
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>(['order.created', 'payment.recorded'])

  const companyId = user?.companyId || ''

  // The browser manages endpoints via the logged-in session cookie (authenticateRequest
  // falls back to it when no x-api-key header is sent) — no API key needed here. The
  // self-serve key below is a separate credential for the company's OWN backend to call
  // the API from outside the browser, where no session cookie exists.
  const [apiKeyMeta, setApiKeyMeta] = useState<ApiKeyMeta | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [keyLoading, setKeyLoading] = useState(false)

  const loadData = React.useCallback(async (): Promise<void> => {
    if (!companyId) return
    await Promise.resolve()
    setLoading(true)
    try {
      const response = await fetch('/api/v1/webhooks')
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
  }, [companyId, showToast])

  const loadApiKey = React.useCallback(async (): Promise<void> => {
    if (!companyId) return
    try {
      const response = await fetch('/api/account/api-keys')
      const body = await response.json()
      if (response.ok) setApiKeyMeta(body.key ?? null)
    } catch {
      // Non-critical for the page's main purpose - silently leave the key section empty.
    }
  }, [companyId])

  React.useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        void loadData()
        void loadApiKey()
      }
    })
    return () => {
      cancelled = true
    }
  }, [loadData, loadApiKey])

  const generateApiKey = async () => {
    setKeyLoading(true)
    try {
      const response = await fetch('/api/account/api-keys', { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Не удалось создать ключ')
      setApiKeyMeta(body.key)
      setRevealedKey(body.plaintext)
      showToast('Новый API-ключ создан', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ошибка создания ключа', 'error')
    } finally {
      setKeyLoading(false)
    }
  }

  const revokeApiKey = async () => {
    setKeyLoading(true)
    try {
      const response = await fetch('/api/account/api-keys', { method: 'DELETE' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Не удалось отозвать ключ')
      setApiKeyMeta(null)
      setRevealedKey(null)
      showToast('API-ключ отозван', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ошибка отзыва ключа', 'error')
    } finally {
      setKeyLoading(false)
    }
  }

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
        headers: { 'content-type': 'application/json' },
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
      const response = await fetch(`/api/v1/webhooks?id=${id}`, { method: 'DELETE' })
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
        <div className="rounded-lg border border-border p-10 text-center bg-muted">
          <p className="text-lg text-gray-700 dark:text-gray-300">Интеграции доступны только для B2B-компаний</p>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Webhooks интеграции</h1>
        <p className="text-sm text-muted-foreground mt-1">Компания: {companyId}</p>
      </div>

      <section className="rounded-lg border border-border p-5 bg-card space-y-3">
        <h2 className="text-lg font-semibold">API-ключ для вашей интеграции</h2>
        <p className="text-sm text-muted-foreground">
          Используйте этот ключ, чтобы ваша собственная система вызывала наш API снаружи (заголовок <code>x-api-key</code>). Управлять endpoint&apos;ами на этой странице можно и без ключа — здесь вы уже авторизованы.
        </p>
        {revealedKey && (
          <div className="rounded border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              Ключ показывается один раз — сохраните его сейчас, повторно увидеть будет нельзя.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all bg-background rounded px-2 py-1.5 border border-border">{revealedKey}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(revealedKey)
                  showToast('Ключ скопирован', 'success')
                }}
              >
                Копировать
              </Button>
            </div>
          </div>
        )}
        {apiKeyMeta ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">
              Активный ключ: <code className="text-xs">{apiKeyMeta.keyPrefix}…</code>
              {apiKeyMeta.lastUsedAt && (
                <span className="text-muted-foreground"> · использован {new Date(apiKeyMeta.lastUsedAt).toLocaleDateString('ru-RU')}</span>
              )}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={generateApiKey} disabled={keyLoading}>Перевыпустить</Button>
              <Button type="button" variant="outline" size="sm" onClick={revokeApiKey} disabled={keyLoading}>Отозвать</Button>
            </div>
          </div>
        ) : (
          <Button type="button" onClick={generateApiKey} disabled={keyLoading}>Сгенерировать ключ</Button>
        )}
      </section>

      <section className="rounded-lg border border-border p-5 bg-card space-y-4">
        <h2 className="text-lg font-semibold">Добавить endpoint</h2>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
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
                    : 'border-border text-gray-700 dark:text-gray-300'
                }`}
              >
                {event}
              </button>
            )
          })}
        </div>
        <Button onClick={addEndpoint} disabled={loading}>Добавить и протестировать</Button>
      </section>

      <section className="rounded-lg border border-border p-5 bg-card">
        <h2 className="text-lg font-semibold mb-3">Активные endpoints ({endpoints.length})</h2>
        <div className="space-y-3">
          {endpoints.map((item) => (
            <div key={item.id} className="rounded border border-border p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-sm break-all">{item.url}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.events.join(', ')}</p>
                </div>
                <Button variant="outline" onClick={() => removeEndpoint(item.id)} disabled={loading}>Удалить</Button>
              </div>
            </div>
          ))}
          {endpoints.length === 0 && <p className="text-sm text-muted-foreground">Нет активных endpoint&apos;ов</p>}
        </div>
      </section>

      <section className="rounded-lg border border-border p-5 bg-card">
        <h2 className="text-lg font-semibold mb-3">История доставок ({deliveries.length})</h2>
        <div className="space-y-3 max-h-[420px] overflow-y-auto">
          {deliveries.map((item) => {
            const ok = item.attempts.some((attempt) => attempt.status === 'success')
            return (
              <div key={item.id} className="rounded border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.event}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${ok ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                    {ok ? 'Доставлено' : 'Ошибка'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{new Date(item.createdAt).toLocaleString('ru-RU')}</p>
                <p className="text-xs text-muted-foreground mt-2">Попыток: {item.attempts.length}</p>
              </div>
            )
          })}
          {deliveries.length === 0 && <p className="text-sm text-muted-foreground">История пока пустая</p>}
        </div>
      </section>
    </main>
  )
}
