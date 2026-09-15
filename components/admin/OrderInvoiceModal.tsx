'use client'

import React, { useState } from 'react'
import { Order } from '@/lib/orders-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { buildInvoiceHtml, fetchInvoiceTitles, type InvoiceLang } from '@/lib/invoice-template'
import { buildInvoicePdfBlob, invoicePdfFileName } from '@/lib/invoice-pdf'
import { useToast } from '@/lib/toast-context'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAdminLocale } from '@/lib/use-admin-locale'

const LANG_LABELS: Record<InvoiceLang, string> = { lv: '🇱🇻 LV', en: '🇺🇸 EN' }

type Props = {
  order: Order
  open: boolean
  onClose: () => void
}

export default function OrderInvoiceModal({ order, open, onClose }: Props): React.ReactElement | null {
  const [lang, setLang] = useState<InvoiceLang>('lv')
  const [email, setEmail] = useState(order.email)
  // Ad hoc only — entered here by staff when the client asks for it, never read from
  // or written back to the order. See lib/orders-store.ts OrderLegalDetails.
  const [personalCode, setPersonalCode] = useState('')
  const [sending, setSending] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [sent, setSent] = useState(false)
  const { showToast } = useToast()
  const { l } = useAdminLocale()
  const isIndividual = (order.legalDetails?.customerType ?? 'individual') === 'individual'

  const handlePreview = async () => {
    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      showToast(l('Разрешите всплывающие окна, чтобы открыть PDF', 'Allow pop-ups to open the PDF', 'Atļaujiet uznirstošos logus, lai atvērtu PDF'), 'error')
      return
    }

    setGeneratingPdf(true)
    try {
      const titles = await fetchInvoiceTitles(order.items, lang)
      const html = buildInvoiceHtml(order, titles, lang, '', personalCode.trim() || undefined)
      const url = URL.createObjectURL(await buildInvoicePdfBlob(html))
      previewWindow.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      previewWindow.close()
      showToast(l('Не удалось сформировать PDF', 'Failed to generate PDF', 'Neizdevās izveidot PDF'), 'error')
    } finally {
      setGeneratingPdf(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const titles = await fetchInvoiceTitles(order.items, lang)
      const html = buildInvoiceHtml(order, titles, lang, '', personalCode.trim() || undefined)
      const blob = await buildInvoicePdfBlob(html)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = invoicePdfFileName(order.id, lang)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      showToast(l('Не удалось сформировать PDF', 'Failed to generate PDF', 'Neizdevās izveidot PDF'), 'error')
    } finally {
      setDownloading(false)
    }
  }

  const handleSend = async () => {
    if (!email.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/orders/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, email: email.trim(), language: lang, personalCode: personalCode.trim() || undefined }),
      })
      if (res.ok) {
        setSent(true)
        showToast(l(`Счёт отправлен на ${email}`, `Invoice sent to ${email}`, `Rēķins nosūtīts uz ${email}`), 'success')
        setTimeout(onClose, 1500)
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(l(`Ошибка отправки: ${data.code ?? 'unknown'}`, `Sending failed: ${data.code ?? 'unknown'}`, `Nosūtīšanas kļūda: ${data.code ?? 'unknown'}`), 'error')
      }
    } catch {
      showToast(l('Ошибка сети', 'Network error', 'Tīkla kļūda'), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="max-w-md p-6">
        <DialogDescription className="sr-only">
          {l('Настройки языка, предпросмотра и отправки счёта клиенту', 'Invoice language, preview and delivery settings', 'Rēķina valodas, priekšskatījuma un nosūtīšanas iestatījumi')}
        </DialogDescription>
        <div className="space-y-5">
        <DialogTitle className="text-lg font-semibold text-foreground">
          {l('Счёт по заказу', 'Invoice for order', 'Rēķins pasūtījumam')} #{order.id}
        </DialogTitle>

        {/* Language selector: LV — стандарт, EN — по запросу покупателя */}
        <div>
          <p id="invoice-language-label" className="text-sm text-muted-foreground mb-2">{l('Язык счёта', 'Invoice language', 'Rēķina valoda')}</p>
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
          <label htmlFor="invoice-recipient-email" className="block text-sm text-muted-foreground mb-2">{l('Email получателя', 'Recipient email', 'Saņēmēja e-pasts')}</label>
          <Input
            id="invoice-recipient-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </div>

        {/* Personal code: ad hoc only, entered here when the client requests it on their
            invoice. Never read from or saved to the order/profile — see comment above. */}
        {isIndividual && (
          <div>
            <label htmlFor="invoice-personal-code" className="block text-sm text-muted-foreground mb-2">{l('Персональный код (по запросу клиента)', "Personal code (only if the client asks)", 'Personas kods (tikai pēc klienta lūguma)')}</label>
            <Input
              id="invoice-personal-code"
              value={personalCode}
              onChange={(e) => setPersonalCode(e.target.value)}
              placeholder={l('Не сохраняется — вводится заново для каждого счёта', 'Not saved — re-entered for every invoice', 'Netiek saglabāts — jāievada katram rēķinam no jauna')}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePreview}
            disabled={generatingPdf}
          >
            {generatingPdf ? l('Формирование PDF...', 'Generating PDF...', 'PDF izveide...') : l('Предпросмотр PDF', 'Preview PDF', 'PDF priekšskatījums')}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? l('Формирование PDF...', 'Generating PDF...', 'PDF izveide...') : l('Скачать', 'Download', 'Lejupielādēt')}
          </Button>
        </div>
        <Button
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={handleSend}
          disabled={sending || sent || !email.trim()}
        >
          {sent ? l('✓ Отправлено', '✓ Sent', '✓ Nosūtīts') : sending ? l('Отправка...', 'Sending...', 'Nosūtīšana...') : l('Отправить', 'Send', 'Nosūtīt')}
        </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
