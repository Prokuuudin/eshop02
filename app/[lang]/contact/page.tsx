'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getSiteUrl } from '@/lib/site-url'
import { useTranslation } from '@/lib/use-translation'
import { COMPANY, COMPANY_CONTACT_LINES } from '@/data/company'
import { stores } from '@/data/stores'
import { serializeJsonLd } from '@/lib/json-ld'
import { localizePath } from '@/lib/i18n-routing'

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

export default function ContactPage(): React.ReactElement {
  const { t, language } = useTranslation()
  const [formData, setFormData] = useState(() => ({
    name: '',
    email: '',
    subject: '',
    message: '',
    website: '',
    submittedAt: Date.now(),
    turnstileToken: ''
  }))
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const siteUrl = getSiteUrl()
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const turnstileEnabled = Boolean(turnstileSiteKey)
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null)
  const turnstileWidgetIdRef = useRef<string | null>(null)
  const contactUrl = `${siteUrl}${localizePath('/contact', language)}`

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
    url: contactUrl
  }

  const openingHoursFor = (storeId: string) => {
    const weekdayCloses = storeId === 'riga-office' ? '17:00' : '19:00'
    const weekendClosed = storeId === 'riga-office'
    const sundayClosed = weekendClosed || storeId === 'liepaja' || storeId === 'valmiera' || storeId === 'jelgava'
    return [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: weekdayCloses,
      },
      ...(!weekendClosed ? [{
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday'],
        opens: '10:00',
        closes: '16:00',
      }] : []),
      ...(!sundayClosed ? [{
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Sunday'],
        opens: '10:00',
        closes: '16:00',
      }] : []),
    ]
  }

  const storeSchemas = stores.map((store) => {
    const addressParts = store.address.lv.split(',').map((part) => part.trim())
    const postalCode = addressParts.find((part) => /^LV-\d{4}$/.test(part))
    const addressLocality = store.city.lv
    const streetAddress = addressParts
      .filter((part) => part !== addressLocality && part !== postalCode && part !== 'Latvija')
      .join(', ')
    const storeUrl = `${siteUrl}${localizePath('/stores', language)}#${store.id}`
    const geo = 'geo' in store ? store.geo : undefined

    return {
      '@type': store.id === 'riga-office' ? 'LocalBusiness' : 'Store',
      '@id': `${siteUrl}/#store-${store.id}`,
      name: `Hairshop-Pro — ${t(`stores.${store.id}.name`)}`,
      url: storeUrl,
      image: `${siteUrl}/stores/${store.id}.jpg`,
      telephone: t(`stores.${store.id}.phone`),
      email: COMPANY.email,
      parentOrganization: { '@id': `${siteUrl}/#organization` },
      address: {
        '@type': 'PostalAddress',
        streetAddress,
        addressLocality,
        ...(postalCode ? { postalCode } : {}),
        addressCountry: 'LV',
      },
      ...(geo ? {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: geo.latitude,
          longitude: geo.longitude,
        },
      } : {}),
      hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address.lv)}`,
      openingHoursSpecification: openingHoursFor(store.id),
      areaServed: { '@type': 'Country', name: 'Latvia' },
      priceRange: '€€',
    }
  })

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'Hairshop-Pro',
        legalName: COMPANY.name,
        url: siteUrl,
        logo: `${siteUrl}/logo.svg`,
        telephone: COMPANY.phone,
        email: COMPANY.email,
        taxID: COMPANY.regNumber,
        vatID: COMPANY.vatNumber,
        sameAs: COMPANY.sameAs,
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Rencēnu iela 10A',
          addressLocality: 'Rīga',
          postalCode: 'LV-1073',
          addressCountry: 'LV',
        },
        department: storeSchemas.map((store) => ({ '@id': store['@id'] })),
      },
      ...storeSchemas,
    ],
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(localBusinessSchema) }} />
      <main className="w-full px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <h1 className="mb-10 flex items-center justify-center gap-3 text-center text-3xl font-bold text-foreground">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground dark:bg-white dark:text-brand">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </span>
            {t('contact.title')}
          </h1>

          <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
            {/* Contact Info */}
            <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow transition-colors dark:border-gray-700">
              <h2 className="mb-3 text-lg font-semibold text-foreground">{t('contact.info')}</h2>
              <div className="space-y-3 leading-6">
                {COMPANY_CONTACT_LINES.map(({ labelKey, value }) => (
                  <div key={labelKey}>
                    <p className="font-semibold text-foreground">{t(labelKey)}:</p>
                    <p className="text-muted-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Contact Form */}
            <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow transition-colors dark:border-gray-700">
              <h2 className="mb-3 text-lg font-semibold text-foreground">{t('contact.formTitle')}</h2>
              {submitted ? (
                <div aria-live="polite" className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-4 rounded text-green-700 dark:text-green-200">
                  ✓ {t('contact.success')}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
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
                    <label htmlFor="contact-name" className="block text-sm font-medium mb-1 text-foreground">{t('contact.name')}</label>
                    <Input
                      id="contact-name"
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="bg-card text-foreground border-border"
                      minLength={2}
                      maxLength={80}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-sm font-medium mb-1 text-foreground">{t('contact.email')}</label>
                    <Input
                      id="contact-email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="bg-card text-foreground border-border"
                      maxLength={160}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-subject" className="block text-sm font-medium mb-1 text-foreground">{t('contact.subject')}</label>
                    <Input
                      id="contact-subject"
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      className="bg-card text-foreground border-border"
                      placeholder={t('contact.subjectPlaceholder')}
                      minLength={3}
                      maxLength={140}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-message" className="block text-sm font-medium mb-1 text-foreground">{t('contact.message')}</label>
                    <Textarea
                      id="contact-message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      className="bg-card text-foreground border-border"
                      rows={4}
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
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
