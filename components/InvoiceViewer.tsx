'use client'

import React, { useState } from 'react'
import { Invoice, PaymentRecord } from '@/lib/invoices-store'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type InvoiceViewerProps = {
  invoice: Invoice
  onClose: () => void
  onRecordPayment?: (invoiceId: string, payment: Omit<PaymentRecord, 'id' | 'date'>) => void
}

export default function InvoiceViewer({ invoice, onClose, onRecordPayment }: InvoiceViewerProps) {
  const { t, language } = useTranslation()
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [paymentReference, setPaymentReference] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const locale = getLocaleFromLanguage(language)
  const formatPrice = (value: number): string => formatEuro(value, locale)

  const statusLabel = t(`account.invoice.status.${invoice.status}`, invoice.status)

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault()
    
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0 || amount > invoice.remainingAmount) {
      alert(t('account.invoiceViewer.invalidPaymentAmount'))
      return
    }

    setIsSubmitting(true)
    onRecordPayment?.(invoice.id, {
      amount,
      method: paymentMethod,
      reference: paymentReference || undefined,
      recordedBy: 'current_user'
    })
    
    setPaymentAmount('')
    setPaymentReference('')
    setShowPaymentForm(false)
    setIsSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-2xl w-full my-8 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{invoice.invoiceNumber}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {t('account.invoiceViewer.orderNumber', undefined, { id: invoice.orderId })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Dates and Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('account.invoiceViewer.issuedAt')}</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {invoice.issuedDate.toLocaleDateString(locale)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('account.invoiceViewer.payBy')}</p>
              <p className={`font-semibold ${invoice.dueDate < new Date() && invoice.status !== 'paid' ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                {invoice.dueDate.toLocaleDateString(locale)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('account.invoiceViewer.status')}</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100 uppercase text-sm">
                {statusLabel}
              </p>
            </div>
          </div>

          {/* Amount Details */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-gray-700 dark:text-gray-300">
              <span>{t('account.invoiceViewer.itemsTotal')}</span>
              <span>{formatPrice(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-700 dark:text-gray-300">
              <span>{t('account.invoiceViewer.vatWithRate', undefined, { rate: invoice.taxRate })}</span>
              <span>{formatPrice(invoice.taxAmount)}</span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold text-lg text-gray-900 dark:text-gray-100">
              <span>{t('account.invoiceViewer.totalToPay')}</span>
              <span>{formatPrice(invoice.total)}</span>
            </div>
          </div>

          {/* Payment Status */}
          {invoice.status === 'issued' && invoice.remainingAmount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex justify-between mb-2">
                <span className="text-amber-900 dark:text-amber-200">{t('account.invoiceViewer.remainingToPay')}</span>
                <span className="font-bold text-lg text-amber-600 dark:text-amber-400">
                  {formatPrice(invoice.remainingAmount)}
                </span>
              </div>
              {invoice.paidAmount > 0 && (
                <div className="flex justify-between text-sm text-amber-800 dark:text-amber-300">
                  <span>{t('account.invoiceViewer.alreadyPaid')}</span>
                  <span>{formatPrice(invoice.paidAmount)}</span>
                </div>
              )}
            </div>
          )}

          {invoice.status === 'paid' && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-green-900 dark:text-green-200 font-semibold">
                {t('account.invoiceViewer.paidInFull')}
              </p>
              {invoice.paidDate && (
                <p className="text-sm text-green-800 dark:text-green-300 mt-1">
                  {t('account.invoiceViewer.paidOnWithDate', undefined, { date: invoice.paidDate.toLocaleDateString(locale) })}
                </p>
              )}
            </div>
          )}

          {/* Items if available */}
          {invoice.items && invoice.items.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('account.invoiceViewer.itemsTitle')}</h3>
              <div className="space-y-2">
                {invoice.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm text-gray-700 dark:text-gray-300 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <div>
                      <p className="font-medium">{item.productTitle}</p>
                      <p className="text-gray-600 dark:text-gray-400">
                        {item.quantity} × {formatPrice(item.unitPrice)}
                      </p>
                    </div>
                    <p className="font-medium">{formatPrice(item.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Records */}
          {invoice.paymentRecords.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('account.invoiceViewer.paymentHistoryTitle')}</h3>
              <div className="space-y-2">
                {invoice.paymentRecords.map((record) => (
                  <div key={record.id} className="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {record.date.toLocaleDateString(locale)}
                      </p>
                      <p className="text-gray-600 dark:text-gray-400 text-xs">
                        {record.method} {record.reference && `(${record.reference})`}
                      </p>
                    </div>
                    <p className="font-bold text-green-600 dark:text-green-400">
                      +{formatPrice(record.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('account.invoiceViewer.notesTitle')}</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded">
                {invoice.notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800">
          {showPaymentForm && invoice.status === 'issued' ? (
            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {t('account.invoiceViewer.paymentAmountLabel', undefined, { max: formatPrice(invoice.remainingAmount) })}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={invoice.remainingAmount}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={t('account.invoiceViewer.paymentAmountPlaceholder')}
                  className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {t('account.invoiceViewer.paymentMethodLabel')}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2"
                >
                  <option value="bank_transfer">{t('account.invoiceViewer.paymentMethod.bankTransfer')}</option>
                  <option value="card">{t('account.invoiceViewer.paymentMethod.card')}</option>
                  <option value="cash">{t('account.invoiceViewer.paymentMethod.cash')}</option>
                  <option value="check">{t('account.invoiceViewer.paymentMethod.check')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {t('account.invoiceViewer.operationNumberLabel')}
                </label>
                <Input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder={t('account.invoiceViewer.operationNumberPlaceholder')}
                  className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={isSubmitting || !paymentAmount}
                  className="flex-1"
                >
                  {isSubmitting ? t('account.invoiceViewer.saving') : t('account.invoiceViewer.recordPayment')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPaymentForm(false)}
                  className="flex-1"
                >
                  {t('account.invoiceViewer.cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2">
              {invoice.status === 'issued' && onRecordPayment && (
                <Button
                  onClick={() => setShowPaymentForm(true)}
                  className="flex-1"
                >
                  {t('account.invoiceViewer.recordPayment')}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                {t('account.invoiceViewer.close')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
