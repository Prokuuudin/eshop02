'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/use-translation'
import { useToast } from '@/lib/toast-context'

type Props = {
  orderId: string
}

/**
 * Lets the customer hand their own personal code to staff for this one invoice.
 * Never stored anywhere: it's relayed straight to the manager preparing the
 * invoice (see app/api/orders/[id]/request-invoice-code/route.ts) and typed
 * into OrderInvoiceModal by hand — invoice generation stays a manager action.
 */
export default function RequestInvoiceCodeCard({ orderId }: Props): React.ReactElement {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (): Promise<void> => {
    const trimmed = code.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/request-invoice-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalCode: trimmed }),
      })
      if (res.ok) {
        setCode('')
        showToast(t('order.invoiceCodeSuccess'), 'success')
      } else {
        showToast(t('order.invoiceCodeError'), 'error')
      }
    } catch {
      showToast(t('order.invoiceCodeError'), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-2 text-lg font-bold text-foreground">{t('order.invoiceCodeTitle')}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t('order.invoiceCodeHint')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('order.invoiceCodePlaceholder')}
          className="sm:flex-1"
        />
        <Button onClick={handleSubmit} disabled={!code.trim() || sending}>
          {sending ? t('order.invoiceCodeSending') : t('order.invoiceCodeSubmit')}
        </Button>
      </div>
    </div>
  )
}
