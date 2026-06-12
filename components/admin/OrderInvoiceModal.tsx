'use client'

import React, { useState } from 'react'
import { Order } from '@/lib/orders-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildInvoiceHtml } from '@/lib/invoice-template'
import { useToast } from '@/lib/toast-context'

type Lang = 'ru' | 'en' | 'lv'

const LANG_LABELS: Record<Lang, string> = { ru: '🇷🇺 RU', en: '🇺🇸 EN', lv: '🇱🇻 LV' }

type Props = {
  order: Order
  open: boolean
  onClose: () => void
}

export default function OrderInvoiceModal({ order, open, onClose }: Props) {
  const [lang, setLang] = useState<Lang>('ru')
  const [email, setEmail] = useState(order.email)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const { showToast } = useToast()

  if (!open) return null

  const handlePreview = () => {
    const html = buildInvoiceHtml(order, lang)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const handleSend = async () => {
    if (!email.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/orders/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, language: lang, email: email.trim() }),
      })
      if (res.ok) {
        setSent(true)
        showToast(`Счёт отправлен на ${email}`, 'success')
        setTimeout(onClose, 1500)
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(`Ошибка отправки: ${data.code ?? 'unknown'}`, 'error')
      }
    } catch {
      showToast('Ошибка сети', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-border w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Счёт по заказу #{order.id}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {/* Language selector */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">Язык счёта</p>
          <div className="flex gap-2">
            {(['ru', 'en', 'lv'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  lang === l
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        {/* Email field */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">Email получателя</p>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePreview}
          >
            Предпросмотр
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-white"
            onClick={handleSend}
            disabled={sending || sent || !email.trim()}
          >
            {sent ? '✓ Отправлено' : sending ? 'Отправка...' : 'Отправить'}
          </Button>
        </div>
      </div>
    </div>
  )
}
