"use client";
import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { useTranslation } from '@/lib/use-translation'

export default function Newsletter({ compact = false, embedded = false }: { compact?: boolean; embedded?: boolean }): React.ReactElement {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function validateEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    if (!validateEmail(email)) {
      setError('Введите корректный email')
      return
    }
    if (!consent) {
      setError(t('newsletter.consentRequired'))
      return
    }
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent }),
      })
      if (!res.ok) {
        setError('Не удалось подписаться, попробуйте позже')
        return
      }
      setSuccess(true)
      setEmail('')
      setConsent(false)
    } catch {
      setError('Ошибка сети, попробуйте ещё раз')
    }
  }

  const inner = (
    <div
      className={
        compact
          ? `newsletter__inner newsletter__inner--compact bg-white p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 ${embedded ? '' : 'rounded-lg border'}`
          : 'newsletter__inner bg-white rounded-lg p-6 border flex flex-col md:flex-row md:items-center gap-6'
      }
    >
      <div className="newsletter__info md:flex-1">
        <h3 className={`newsletter__title font-semibold text-gray-900 ${compact ? 'text-base' : 'text-lg'}`}>{t('newsletter.title')}</h3>
        <p className={`newsletter__desc text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}>{t('newsletter.subtitle')}</p>
      </div>

      <div className="newsletter__action md:flex-1">
        <form onSubmit={onSubmit} className={`newsletter__form flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
          <div className="flex flex-col md:flex-row gap-2">
            <input
              className="newsletter__input rounded-md border px-3 py-2 flex-1"
              placeholder={t('newsletter.placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label={t('newsletter.emailAria')}
            />
            <Button type="submit">{t('newsletter.subscribe')}</Button>
          </div>

          <div className="newsletter__consent flex items-start gap-2">
            <Checkbox
              id="newsletter-consent"
              checked={consent}
              onCheckedChange={setConsent}
            />
            <label htmlFor="newsletter-consent" className={`newsletter__consent-label text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}>
              {t('newsletter.consentPrefix')}
              <Link href="/terms" className="underline">{t('newsletter.consentLinkLabel')}</Link>
            </label>
          </div>
        </form>

        {error && <div className="newsletter__error text-red-600 text-sm mt-2">{error}</div>}
        {success && <div className="newsletter__success text-green-600 text-sm mt-2">{t('newsletter.subscribed')}</div>}
      </div>
    </div>
  )

  if (compact) {
    return <div className="newsletter newsletter--compact">{inner}</div>
  }

  return (
    <section className="newsletter py-8">
      <div className="mx-auto w-full max-w-[1200px] px-4">{inner}</div>
    </section>
  )
}
