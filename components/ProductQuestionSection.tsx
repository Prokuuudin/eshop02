'use client'

import React, { useEffect, useState } from 'react'
import Script from 'next/script'
import { MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import PhoneInput from '@/components/ui/phone-input'
import { useTranslation } from '@/lib/use-translation'
import { TURNSTILE_SCRIPT_SRC, useTurnstile } from '@/lib/use-turnstile'

type Props = {
  productName: string
  productId: string | number
}

const initialFormState = {
  name: '',
  email: '',
  phone: '',
  question: '',
  website: '',
}

export default function ProductQuestionSection({ productName, productId }: Props): React.ReactElement {
  const { t, language } = useTranslation()
  const [formData, setFormData] = useState(initialFormState)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const {
    enabled: turnstileEnabled,
    token: turnstileToken,
    setContainer: setTurnstileContainer,
    render: renderTurnstile,
    reset: resetTurnstile,
  } = useTurnstile()

  useEffect(() => {
    if (expanded) renderTurnstile()
  }, [expanded, renderTurnstile])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          subject: `${t('product.question.subject')}: ${productName}`.slice(0, 140),
          message: [
            `${t('product.question.product')}: ${productName}`,
            `ID: ${productId}`,
            formData.phone.trim() ? `${t('home.productRequest.phone')}: ${formData.phone.trim()}` : '',
            `${t('product.question.message')}: ${formData.question.trim()}`,
            `Language: ${language}`,
          ].filter(Boolean).join('\n'),
          website: formData.website,
          submittedAt: startedAt,
          turnstileToken,
        }),
      })

      const result = (await response.json()) as { ok?: boolean; code?: string }
      if (!response.ok || !result.ok) {
        if (result.code === 'rate_limited') setSubmitError(t('contact.errorRateLimited'))
        else if (result.code === 'spam_detected' || result.code === 'invalid_timing' || result.code === 'invalid_origin') setSubmitError(t('contact.errorSpam'))
        else if (result.code === 'captcha_required' || result.code === 'captcha_failed') {
          setSubmitError(t('contact.errorCaptcha'))
          resetTurnstile()
        } else setSubmitError(t('contact.errorGeneric'))
        return
      }

      setSubmitted(true)
      setFormData(initialFormState)
      setStartedAt(Date.now())
      resetTurnstile()
    } catch {
      setSubmitError(t('contact.errorGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mb-12" id="product-question">
      {turnstileEnabled && (
        <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" onLoad={renderTurnstile} />
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 bg-gray-100 px-5 py-5 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between md:px-7">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
              <MessageCircleQuestion className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('product.question.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('product.question.description')}</p>
            </div>
          </div>
          <Button
            type="button"
            aria-expanded={expanded}
            aria-controls="product-question-form"
            onClick={() => {
              setExpanded((current) => !current)
              setSubmitted(false)
            }}
          >
            {t('product.question.open')}
          </Button>
        </div>

        {expanded && (
          <div id="product-question-form" className="ui-disclosure-in border-t border-border p-5 md:p-7">
            {submitted ? (
              <div aria-live="polite" className="rounded-md border border-green-200 bg-green-50 p-4 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
                ✓ {t('product.question.success')}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="text" name="website" value={formData.website} onChange={handleChange} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <span className="font-medium text-foreground">{t('product.question.product')}:</span>{' '}
                  <span className="text-muted-foreground">{productName}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="product-question-name" className="mb-1 block text-sm font-medium">{t('contact.name')}</label>
                    <Input id="product-question-name" name="name" value={formData.name} onChange={handleChange} minLength={2} maxLength={80} required />
                  </div>
                  <div>
                    <label htmlFor="product-question-email" className="mb-1 block text-sm font-medium">{t('contact.email')}</label>
                    <Input id="product-question-email" type="email" name="email" value={formData.email} onChange={handleChange} maxLength={160} required />
                  </div>
                  <div>
                    <span className="mb-1 block text-sm font-medium">{t('home.productRequest.phone')}</span>
                    <PhoneInput value={formData.phone} onChange={(phone) => setFormData((current) => ({ ...current, phone }))} placeholder={t('home.productRequest.phonePlaceholder')} />
                  </div>
                </div>
                <div>
                  <label htmlFor="product-question-message" className="mb-1 block text-sm font-medium">{t('product.question.message')}</label>
                  <Textarea id="product-question-message" name="question" value={formData.question} onChange={handleChange} placeholder={t('product.question.messagePlaceholder')} rows={4} minLength={10} maxLength={2000} required />
                </div>
                {turnstileEnabled && <div ref={setTurnstileContainer} />}
                {submitError && (
                  <div aria-live="polite" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">{submitError}</div>
                )}
                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting || (turnstileEnabled && !turnstileToken)}>
                    {submitting ? t('contact.sending') : t('product.question.send')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
