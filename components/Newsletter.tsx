"use client";
import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { useTranslation } from '@/lib/use-translation'

export default function Newsletter() {
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
        setError('Введите корректный email')
        return
      }
      setSuccess(true)
      setEmail('')
      setConsent(false)
    } catch {
      setError('Ошибка сети, попробуйте ещё раз')
    }
  }

  return (
    <section className="newsletter py-8">
      <div className="w-full px-4">
        <div className="newsletter__inner bg-white rounded-lg p-6 border flex flex-col gap-4">
          <div className="newsletter__info">
            <h3 className="newsletter__title text-lg font-semibold text-gray-900">{t('newsletter.title')}</h3>
            <p className="newsletter__desc text-sm text-gray-600">{t('newsletter.subtitle')}</p>
          </div>

          <form onSubmit={onSubmit} className="newsletter__form flex flex-col gap-3">
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
              <label htmlFor="newsletter-consent" className="newsletter__consent-label text-sm text-gray-600">
                {t('newsletter.consentPrefix')}
                <Link href="/privacy" className="underline">{t('newsletter.consentLinkLabel')}</Link>
              </label>
            </div>
          </form>

          {error && <div className="newsletter__error text-red-600 text-sm">{error}</div>}
          {success && <div className="newsletter__success text-green-600 text-sm">{t('newsletter.subscribed')}</div>}
        </div>
      </div>
    </section>
  )
}
