'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Script from 'next/script'
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

export default function ProductRequestSection({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const { t, language } = useTranslation()
  const [formData, setFormData] = useState(initialFormState)
  const [startedAt] = useState(() => Date.now())
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

  // Контейнер капчи монтируется только вместе с формой
  useEffect(() => {
    if (expanded) {
      renderTurnstile()
    }
  }, [expanded, renderTurnstile])

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
          turnstileToken
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
          resetTurnstile()
        } else {
          setSubmitError(t('contact.errorGeneric'))
        }
        return
      }

      setSubmitted(true)
      setFormData(initialFormState)
      resetTurnstile()

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
    <section className={embedded ? 'product-request mb-12' : 'product-request pt-8 md:pt-10'} id="product-request">
      {turnstileEnabled && (
        <Script src={TURNSTILE_SCRIPT_SRC} strategy="afterInteractive" onLoad={renderTurnstile} />
      )}
      <div className={embedded ? 'product-request__container' : 'product-request__container mx-auto w-full max-w-[1440px] px-4'}>
        <div className={`product-request__banner relative rounded-xl bg-emerald-600 dark:bg-emerald-700 px-6 py-6 md:min-h-[97px] md:px-10 md:pl-36 flex flex-col md:flex-row items-center justify-between gap-4 ${embedded ? 'md:mt-16' : ''}`}>
          <Image
            src="/girl2.png"
            alt=""
            aria-hidden="true"
            width={240}
            height={160}
            className="product-request__girl pointer-events-none select-none absolute bottom-0 -left-16 hidden h-44 w-auto max-w-none md:block"
          />
          <h2 className="product-request__title text-lg md:text-xl font-bold uppercase tracking-wide text-white text-center md:text-left">
            {t('home.productRequest.title')}{' '}
            <span className="product-request__title-accent text-amber-200">
              {t('home.productRequest.titleAccent')}
            </span>
          </h2>
          <Button
            type="button"
            aria-expanded={expanded}
            aria-controls="product-request-card"
            className="product-request__open shrink-0 rounded-full border border-white bg-transparent text-white hover:bg-white/10 uppercase tracking-wide px-6"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {t('home.productRequest.open')}
          </Button>
        </div>

        {expanded && (
          <div id="product-request-card" className="product-request__card ui-disclosure-in mt-4 rounded-lg border bg-card p-4 md:p-5">
            {submitted ? (
              <div
                aria-live="polite"
                className="product-request__success bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-4 rounded text-green-700 dark:text-green-200"
              >
                ✓ {t('home.productRequest.success')}
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
                    ref={(element) => element?.focus()}
                    required
                  />
                </div>
                <div className="product-request__field grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                  <div>
                    <span className="product-request__label block text-sm font-medium mb-1 text-foreground">
                      {t('home.productRequest.phone')}
                    </span>
                    <PhoneInput
                      value={formData.phone}
                      onChange={(value) => setFormData((prev) => ({ ...prev, phone: value }))}
                      placeholder={t('home.productRequest.phonePlaceholder')}
                    />
                  </div>
                </div>
                {turnstileEnabled && (
                  <div className="product-request__captcha pt-1">
                    <div ref={setTurnstileContainer} />
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
                <div className="product-request__actions grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="product-request__field sm:col-span-2">
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
                      rows={2}
                      maxLength={2000}
                    />
                  </div>
                  <div className="flex flex-col justify-between gap-2 sm:pt-6">
                    <p className="product-request__note text-xs leading-snug text-muted-foreground">
                      {t('home.productRequest.note')}
                    </p>
                    <Button
                      type="submit"
                      className="product-request__submit w-full"
                      disabled={submitting || (turnstileEnabled && !turnstileToken)}
                    >
                      {submitting ? t('contact.sending') : t('home.productRequest.send')}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
