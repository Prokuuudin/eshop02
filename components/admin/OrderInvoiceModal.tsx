'use client'

import React, { useState } from 'react'
import { Order } from '@/lib/orders-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildInvoiceHtml, fetchInvoiceTitles, type InvoiceLang } from '@/lib/invoice-template'
import { buildInvoicePdfBlob } from '@/lib/invoice-pdf'
import { useToast } from '@/lib/toast-context'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const LANG_LABELS: Record<InvoiceLang, string> = { lv: '🇱🇻 LV', en: '🇺🇸 EN' }

type Props = {
  order: Order
  open: boolean
  onClose: () => void
}

export default function OrderInvoiceModal({ order, open, onClose }: Props): React.ReactElement | null {
  const [lang, setLang] = useState<InvoiceLang>('lv')
  const [email, setEmail] = useState(order.email)
  const [sending, setSending] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [sent, setSent] = useState(false)
  const { showToast } = useToast()

  const handlePreview = async () => {
    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      showToast('Разрешите всплывающие окна, чтобы открыть PDF', 'error')
      return
    }

    setGeneratingPdf(true)
    try {
      const titles = await fetchInvoiceTitles(order.items, lang)
      const html = buildInvoiceHtml(order, titles, lang)
      const url = URL.createObjectURL(await buildInvoicePdfBlob(html))
      previewWindow.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      previewWindow.close()
      showToast('Не удалось сформировать PDF', 'error')
    } finally {
      setGeneratingPdf(false)
    }
  }

  const handleSend = async () => {
    if (!email.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/orders/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, email: email.trim(), language: lang }),
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
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="max-w-md p-6">
        <DialogDescription className="sr-only">
          Настройки языка, предпросмотра и отправки счёта клиенту
        </DialogDescription>
        <div className="space-y-5">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-lg font-semibold text-foreground">
            Счёт по заказу #{order.id}
          </DialogTitle>
          <button type="button" onClick={onClose} aria-label="Закрыть окно счёта" className="text-muted-foreground hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {/* Language selector: LV — стандарт, EN — по запросу покупателя */}
        <div>
          <p id="invoice-language-label" className="text-sm text-muted-foreground mb-2">Язык счёта</p>
          <div className="flex gap-2">
            {(['lv', 'en'] as InvoiceLang[]).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                aria-labelledby="invoice-language-label"
                onClick={() => setLang(l)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  lang === l
                    ? 'bg-primary text-primary-foreground border-primary'
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
          <label htmlFor="invoice-recipient-email" className="block text-sm text-muted-foreground mb-2">Email получателя</label>
          <Input
            id="invoice-recipient-email"
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
            disabled={generatingPdf}
          >
            {generatingPdf ? 'Формирование PDF...' : 'Предпросмотр PDF'}
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSend}
            disabled={sending || sent || !email.trim()}
          >
            {sent ? '✓ Отправлено' : sending ? 'Отправка...' : 'Отправить'}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
