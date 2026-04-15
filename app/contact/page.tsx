'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getSiteUrl } from '@/lib/site-url'
import { useTranslation } from '@/lib/use-translation'

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string
    callback: (token: string) => void
    'expired-callback'?: () => void
    'error-callback'?: () => void
  }) => string
  reset: (widgetId: string) => void
}

type TurnstileWindow = Window & typeof globalThis & {
  turnstile?: TurnstileApi
}

export default function ContactPage() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    website: '',
    submittedAt: Date.now(),
    turnstileToken: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const siteUrl = getSiteUrl()
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const turnstileEnabled = Boolean(turnstileSiteKey)
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)
  const turnstileWidgetIdRef = useRef<string | null>(null)

  const setTurnstileToken = useCallback((token: string) => {
    setFormData((prev) => ({ ...prev, turnstileToken: token }))
  }, [])

  const renderTurnstile = useCallback(() => {
    if (!turnstileEnabled || !turnstileContainerRef.current || turnstileWidgetIdRef.current !== null) {
      return
    }

    const browserWindow = window as TurnstileWindow
    if (!browserWindow.turnstile) {
      return
    }

    turnstileWidgetIdRef.current = browserWindow.turnstile.render(turnstileContainerRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token: string) => {
        setTurnstileToken(token)
      },
      'expired-callback': () => {
        setTurnstileToken('')
      },
      'error-callback': () => {
        setTurnstileToken('')
      }
    })
  }, [setTurnstileToken, turnstileEnabled, turnstileSiteKey])

  const resetTurnstile = useCallback(() => {
    if (!turnstileEnabled) {
      return
    }

    const browserWindow = window as TurnstileWindow
    if (browserWindow.turnstile && turnstileWidgetIdRef.current) {
      browserWindow.turnstile.reset(turnstileWidgetIdRef.current)
    }
    setTurnstileToken('')
  }, [setTurnstileToken, turnstileEnabled])

  useEffect(() => {
    renderTurnstile()
  }, [renderTurnstile])

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: t('contact.faq.q1'),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('contact.faq.a1')
        }
      },
      {
        '@type': 'Question',
        name: t('contact.faq.q2'),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('contact.faq.a2')
        }
      },
      {
        '@type': 'Question',
        name: t('contact.faq.q3'),
        acceptedAnswer: {
          '@type': 'Answer',
          text: t('contact.faq.a3')
        }
      }
    ],
    url: `${siteUrl}/contact`
  }

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'HairShop',
    url: `${siteUrl}/contact`,
    image: `${siteUrl}/logo.png`,
    telephone: '+37127067730',
    email: 'Info@HairShop.lv',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Rencēnu 10A',
      addressLocality: 'Rīga',
      postalCode: 'LV-1073',
      addressCountry: 'Latvija'
    },
    vatID: 'LV 40103351370',
    bankAccount: 'LV66HABA0551036604107',
    bankName: 'AS Swedbank',
    swift: 'HABALV22',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday'
        ],
        opens: '10:00',
        closes: '18:00'
      }
    ],
    areaServed: 'LV',
    priceRange: '€€'
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
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
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: '',
        website: '',
        submittedAt: Date.now(),
        turnstileToken: ''
      })
      resetTurnstile()

      setTimeout(() => {
        setSubmitted(false)
      }, 3000)
    } catch {
      setSubmitError(t('contact.errorGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {turnstileEnabled && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={renderTurnstile}
        />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      <main className="w-full px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">{t('contact.title')}</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Contact Info */}
            <div>
              <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{t('contact.info')}</h2>
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{t('contact.legalAddressLabel')}:</p>
                  <p className="text-gray-600 dark:text-gray-300">{t('contact.street')}, {t('contact.city')}, {t('contact.country')}, {t('contact.postalCode')}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{t('contact.vatLabel')}:</p>
                  <p className="text-gray-600 dark:text-gray-300">{t('contact.vatValue')}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{t('contact.bankLabel')}:</p>
                  <p className="text-gray-600 dark:text-gray-300">{t('contact.bankValue')}</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{t('contact.bankAccountLabel')}:</p>
                  <p className="text-gray-600 dark:text-gray-300">{t('contact.bankAccountValue')}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{t('contact.officeAddressLabel')}:</p>
                  <p className="text-gray-600 dark:text-gray-300">{t('contact.country')}, {t('contact.city')}, {t('contact.street')}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{t('contact.phoneLabel')}:</p>
                  <p className="text-gray-600 dark:text-gray-300">{t('contact.phoneValue')}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{t('contact.emailLabel')}:</p>
                  <p className="text-gray-600 dark:text-gray-300">{t('contact.emailValue')}</p>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div>
              <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{t('contact.formTitle')}</h2>
              {submitted ? (
                <div aria-live="polite" className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-4 rounded text-green-700 dark:text-green-200">
                  ✓ {t('contact.success')}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
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
                  <input
                    type="hidden"
                    name="submittedAt"
                    value={String(formData.submittedAt)}
                    readOnly
                  />
                  <input
                    type="hidden"
                    name="turnstileToken"
                    value={formData.turnstileToken}
                    readOnly
                  />
                  {turnstileEnabled && (
                    <div className="pt-1">
                      <div ref={turnstileContainerRef} />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t('contact.name')}</label>
                    <Input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                      minLength={2}
                      maxLength={80}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t('contact.email')}</label>
                    <Input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                      maxLength={160}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t('contact.subject')}</label>
                    <Input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                      placeholder={t('contact.subjectPlaceholder')}
                      minLength={3}
                      maxLength={140}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t('contact.message')}</label>
                    <Textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                      rows={5}
                      minLength={10}
                      maxLength={5000}
                      required
                    />
                  </div>
                  {submitError && (
                    <div aria-live="polite" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 p-3 rounded text-red-700 dark:text-red-200 text-sm">
                      {submitError}
                    </div>
                  )}
                  <Button type="submit" disabled={submitting || (turnstileEnabled && !formData.turnstileToken)}>{submitting ? t('contact.sending') : t('contact.send')}</Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
