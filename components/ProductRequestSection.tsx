'use client'

import React, { useEffect, useState } from 'react'
import Script from 'next/script'
import { PackageSearch, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import PhoneInput from '@/components/ui/phone-input'
import { useTranslation } from '@/lib/use-translation'
import { useTurnstile, TURNSTILE_SCRIPT_SRC } from '@/lib/use-turnstile'

const SUBJECT_PREFIX = 'Запрос товара'
const SUBJECT_MAX_LENGTH = 140

const initialFormState = {
  name: '',
  email: '',
  phone: '',
  product: '',
  comment: '',
  website: ''
}

export default function ProductRequestSection({ embedded = false }: { embedded?: boolean }) {
  const { t, language } = useTranslation()
  const [formData, setFormData] = useState(initialFormState)
  const [startedAt] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const turnstile = useTurnstile()

  const renderTurnstile = turnstile.render

  // Контейнер капчи монтируется только вместе с формой
  useEffect(() => {
    if (expanded) {
      renderTurnstile()
    }
  }, [expanded, renderTurnstile])

  const benefits = [
    { id: 'search', icon: PackageSearch, text: t('home.productRequest.benefitSearch') },
    { id: 'order', icon: Truck, text: t('home.productRequest.benefitOrder') }
  ]

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')

    const product = formData.product.trim()
    const subject = `${SUBJECT_PREFIX}: ${product}`.slice(0, SUBJECT_MAX_LENGTH)
    const messageLines = [
      `Ищут товар: ${product}`,
      formData.phone.trim() ? `Телефон: ${formData.phone.trim()}` : '',
      formData.comment.trim() ? `Комментарий: ${formData.comment.trim()}` : '',
      `Язык интерфейса: ${language}`
    ].filter(Boolean)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          subject,
          message: messageLines.join('\n'),
          website: formData.website,
          submittedAt: startedAt,
          turnstileToken: turnstile.token
        })
      })

      const result = (await response.json()) as { ok?: boolean; code?: string }

      if (!response.ok || !result.ok) {
        if (result.code === 'rate_limited') {
          setSubmitError(t('contact.errorRateLimited'))
        } else if (result.code === 'spam_detected' || result.code === 'invalid_timing' || result.code === 'invalid_origin') {
          setSubmitError(t('contact.errorSpam'))
        } else if (result.code === 'captcha_required' || result.code === 'captcha_failed') {
          setSubmitError(t('contact.errorCaptcha'))
          turnstile.reset()
        } else {
          setSubmitError(t('contact.errorGeneric'))
        }
        return
      }

      setSubmitted(true)
      setFormData(initialFormState)
      turnstile.reset()

      setTimeout(() => {
        setSubmitted(false)
        setExpanded(false)
      }, 5000)
    } catch {
      setSubmitError(t('contact.errorGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className={embedded ? 'product-request mb-12' : 'product-request py-10'} id="product-request">
      {turnstile.enabled && (
        <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" onLoad={turnstile.render} />
      )}
      <div className={embedded ? 'product-request__container' : 'product-request__container max-w-6xl mx-auto px-4'}>
        <div className="product-request__layout grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="product-request__content">
            <h2 className="product-request__title text-2xl font-semibold text-foreground mb-2">
              {t('home.productRequest.title')}
            </h2>
            <p className="product-request__subtitle text-sm text-muted-foreground mb-6">
              {t('home.productRequest.subtitle')}
            </p>
            <ul className="product-request__benefits space-y-4">
              {benefits.map((benefit) => (
                <li key={benefit.id} className="product-request__benefit flex items-start gap-3">
                  <span className="product-request__benefit-icon w-10 h-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <benefit.icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="product-request__benefit-text text-sm text-foreground pt-2.5">
                    {benefit.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="product-request__card rounded-lg border bg-card p-4 md:p-6">
            {submitted ? (
              <div
                aria-live="polite"
                className="product-request__success bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-4 rounded text-green-700 dark:text-green-200"
              >
                ✓ {t('home.productRequest.success')}
              </div>
            ) : !expanded ? (
              <div className="product-request__cta flex flex-col items-start gap-3">
                <p className="product-request__cta-hint text-sm text-muted-foreground">
                  {t('home.productRequest.openHint')}
                </p>
                <Button
                  type="button"
                  className="product-request__open w-full sm:w-auto"
                  onClick={() => setExpanded(true)}
                >
                  {t('home.productRequest.open')}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="product-request__form space-y-4">
                <input
                  type="text"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  aria-hidden="true"
                />
                <div className="product-request__field">
                  <label htmlFor="product-request-product" className="product-request__label block text-sm font-medium mb-1 text-foreground">
                    {t('home.productRequest.product')}
                  </label>
                  <Input
                    id="product-request-product"
                    type="text"
                    name="product"
                    value={formData.product}
                    onChange={handleChange}
                    className="bg-background text-foreground border-border"
                    placeholder={t('home.productRequest.productPlaceholder')}
                    minLength={3}
                    maxLength={200}
                    autoFocus
                    required
                  />
                </div>
                <div className="product-request__field grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="product-request-name" className="product-request__label block text-sm font-medium mb-1 text-foreground">
                      {t('contact.name')}
                    </label>
                    <Input
                      id="product-request-name"
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="bg-background text-foreground border-border"
                      minLength={2}
                      maxLength={80}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="product-request-email" className="product-request__label block text-sm font-medium mb-1 text-foreground">
                      {t('contact.email')}
                    </label>
                    <Input
                      id="product-request-email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="bg-background text-foreground border-border"
                      maxLength={160}
                      required
                    />
                  </div>
                </div>
                <div className="product-request__field">
                  <span className="product-request__label block text-sm font-medium mb-1 text-foreground">
                    {t('home.productRequest.phone')}
                  </span>
                  <PhoneInput
                    value={formData.phone}
                    onChange={(value) => setFormData((prev) => ({ ...prev, phone: value }))}
                    placeholder={t('home.productRequest.phonePlaceholder')}
                  />
                </div>
                <div className="product-request__field">
                  <label htmlFor="product-request-comment" className="product-request__label block text-sm font-medium mb-1 text-foreground">
                    {t('home.productRequest.comment')}
                  </label>
                  <Textarea
                    id="product-request-comment"
                    name="comment"
                    value={formData.comment}
                    onChange={handleChange}
                    className="bg-background text-foreground border-border"
                    placeholder={t('home.productRequest.commentPlaceholder')}
                    rows={3}
                    maxLength={2000}
                  />
                </div>
                {turnstile.enabled && (
                  <div className="product-request__captcha pt-1">
                    <div ref={turnstile.containerRef} />
                  </div>
                )}
                {submitError && (
                  <div
                    aria-live="polite"
                    className="product-request__error bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-3 rounded text-red-700 dark:text-red-200 text-sm"
                  >
                    {submitError}
                  </div>
                )}
                <Button
                  type="submit"
                  className="product-request__submit w-full sm:w-auto"
                  disabled={submitting || (turnstile.enabled && !turnstile.token)}
                >
                  {submitting ? t('contact.sending') : t('home.productRequest.send')}
                </Button>
                <p className="product-request__note text-xs text-muted-foreground">
                  {t('home.productRequest.note')}
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
