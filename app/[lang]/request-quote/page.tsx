'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { type Product } from '@/data/products'
import { getCurrentUser } from '@/lib/auth'
import { useRFQStore, mapServerRfq } from '@/lib/rfq-store'
import { logAuditAction } from '@/lib/audit-log-store'
import { formatDate, formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/lib/toast-context'
import { fetchAllProducts } from '@/lib/client-products'
import { useTranslation } from '@/lib/use-translation'
import { localizePath } from '@/lib/i18n-routing'

type DraftItem = {
  productId: string
  quantity: number
}

export default function RequestQuotePage(): React.ReactElement {
  const { t, language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const user = getCurrentUser()
  const { showToast } = useToast()
  const { createRequest, getByCompany, setStatus, setRequests } = useRFQStore()
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)

  const [items, setItems] = useState<DraftItem[]>([{ productId: '', quantity: 10 }])
  const [notes, setNotes] = useState('')

  const companyId = user?.companyId
  const rfqList = useMemo(() => (companyId ? getByCompany(companyId) : []), [companyId, getByCompany])

  React.useEffect(() => {
    const loadAll = async () => {
      const all: Array<ReturnType<typeof mapServerRfq>> = []
      let skip = 0
      for (;;) {
        const response = await fetch(`/api/rfq?skip=${skip}&take=200`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`rfq_load_failed:${response.status}`)
        const payload = await response.json() as { requests?: Array<Parameters<typeof mapServerRfq>[0]>; total?: number }
        const page = Array.isArray(payload.requests) ? payload.requests.map(mapServerRfq) : []
        all.push(...page)
        if (page.length < 200 || all.length >= (payload.total ?? all.length)) return all
        skip += page.length
      }
    }
    loadAll()
      .then(setRequests)
      .catch(() => {})
  }, [setRequests])

  React.useEffect(() => {
    const loadProducts = async () => {
      try {
        const nextProducts = await fetchAllProducts()
        setProducts(nextProducts)
        setItems((prev) => prev.map((item, index) => (index === 0 && !item.productId
          ? { ...item, productId: nextProducts[0]?.id ?? '' }
          : item
        )))
      } catch {
        setProducts([])
      } finally {
        setProductsLoading(false)
      }
    }

    void loadProducts()
  }, [])

  const addRow = () => {
    setItems((prev) => [...prev, { productId: products[0]?.id || '', quantity: 10 }])
  }

  const removeRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) {
      showToast(t('account.requestQuote.b2bOnlyToast'), 'error')
      return
    }

    const normalized = items
      .filter((item) => item.productId && item.quantity > 0)
      .map((item) => ({ productId: item.productId, quantity: Math.floor(item.quantity) }))

    if (normalized.length === 0) {
      showToast(t('account.requestQuote.addAtLeastOneToast'), 'error')
      return
    }

    const { id: rfqId, ok } = await createRequest({
      companyId,
      items: normalized,
      notes: notes.trim(),
      createdByUserId: user?.id
    })

    if (!ok) {
      showToast(t('account.requestQuote.submitErrorToast'), 'error')
      return
    }

    if (user?.companyId) {
      logAuditAction(user.companyId, user.id, 'rfq_created', { rfqId, items: normalized.length })
    }

    showToast(t('account.requestQuote.submitSuccessToast'), 'success')
    setItems([{ productId: products[0]?.id || '', quantity: 10 }])
    setNotes('')
  }

  const acceptQuote = async (rfqId: string) => {
    const ok = await setStatus(rfqId, 'accepted')
    showToast(
      ok ? t('account.requestQuote.quoteAcceptedToast') : t('account.requestQuote.acceptErrorToast'),
      ok ? 'success' : 'error'
    )
  }

  const rejectQuote = async (rfqId: string) => {
    const ok = await setStatus(rfqId, 'rejected')
    showToast(
      ok ? t('account.requestQuote.quoteRejectedToast') : t('account.requestQuote.rejectErrorToast'),
      ok ? 'info' : 'error'
    )
  }

  const statusLabel = (status: string) => t(`account.requestQuote.status.${status}`, status)

  if (!companyId) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-4">{t('account.requestQuote.restrictedTitle')}</h1>
        <div className="rounded-lg border border-border p-10 text-center bg-muted">
          <p className="text-gray-700 dark:text-gray-300 mb-4">{t('account.requestQuote.b2bOnlyMessage')}</p>
          <Link href={localizePath('/account', language)}>
            <Button variant="outline">{t('account.requestQuote.goToAccount')}</Button>
          </Link>
        </div>
      </main>
    )
  }

  if (productsLoading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-12">
        <p className="text-sm text-muted-foreground">{t('account.requestQuote.loadingProducts')}</p>
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-foreground">{t('account.requestQuote.pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t('account.requestQuote.pageDescription')}
        </p>
      </section>

      <section className="rounded-lg border border-border p-5 bg-card">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_140px_100px] gap-2">
                <Select value={item.productId} onValueChange={(v) => updateRow(index, { productId: v })}>
                  <SelectTrigger className="rounded border border-border bg-background px-3 py-2 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
                  className="rounded border border-border bg-background px-3 py-2 text-base md:text-sm"
                  placeholder={t('account.requestQuote.quantityPlaceholder')}
                />

                <Button type="button" variant="outline" onClick={() => removeRow(index)} disabled={items.length === 1}>
                  {t('common.delete')}
                </Button>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addRow}>
            {t('account.requestQuote.addProduct')}
          </Button>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm min-h-[100px]"
            placeholder={t('account.requestQuote.notesPlaceholder')}
          />

          <Button type="submit">{t('account.requestQuote.submit')}</Button>
        </form>
      </section>

      <section className="rounded-lg border border-border p-5 bg-card">
        <h2 className="text-xl font-semibold text-foreground mb-4">{t('account.requestQuote.myRequests')}</h2>
        <div className="space-y-3">
          {rfqList.map((rfq) => (
            <div key={rfq.id} className="rounded border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{rfq.id}</p>
                  <p className="text-xs text-muted-foreground">{t('account.requestQuote.createdLabel')}: {formatDate(rfq.createdAt, locale)}</p>
                </div>
                <span className="text-xs rounded px-2 py-1 bg-muted">{statusLabel(rfq.status)}</span>
              </div>

              <ul className="mt-3 text-sm space-y-1">
                {rfq.items.map((item, idx) => {
                  const product = products.find((p) => p.id === item.productId)
                  return (
                    <li key={idx} className="text-gray-700 dark:text-gray-300">
                      {item.title || product?.title || item.productId} - {item.quantity} {t('account.requestQuote.unitsShort')}
                    </li>
                  )
                })}
              </ul>

              {rfq.notes && <p className="mt-2 text-sm text-muted-foreground">{t('account.requestQuote.notesLabel')}: {rfq.notes}</p>}

              {rfq.quote && (
                <div className="mt-3 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{t('account.requestQuote.quoteReceived')}</p>
                  <p className="text-sm mt-1">{t('account.requestQuote.amountLabel')}: {formatEuro(rfq.quote.totalPrice, locale)}</p>
                  <p className="text-xs text-muted-foreground">{t('account.requestQuote.validUntilLabel')}: {formatDate(rfq.quote.validUntil, locale)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('account.requestQuote.termsLabel')}: {rfq.quote.terms}</p>

                  {rfq.status === 'quoted' && (rfq.quote.validUntil.getTime() > Date.now() ? (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => acceptQuote(rfq.id)}>{t('account.requestQuote.accept')}</Button>
                      <Button size="sm" variant="outline" onClick={() => rejectQuote(rfq.id)}>{t('account.requestQuote.reject')}</Button>
                    </div>
                  ) : <p className="mt-3 text-sm text-destructive">{t('account.requestQuote.expired')}</p>)}
                  {rfq.status === 'accepted' && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{t('account.requestQuote.acceptedNextStep')}</p>}
                </div>
              )}
            </div>
          ))}
          {rfqList.length === 0 && <p className="text-sm text-muted-foreground">{t('account.requestQuote.noRequestsYet')}</p>}
        </div>
      </section>
    </main>
  )
}
