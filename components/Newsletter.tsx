"use client";
import React, { useState } from 'react'
import { Button } from './ui/button'
import { useTranslation } from '@/lib/use-translation'

export default function Newsletter() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function validateEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validateEmail(email)) {
      setError('Введите корректный email')
      return
    }
    setSuccess(true)
    setEmail('')
  }

  return (
    <section className="newsletter py-8">
      <div className="w-full px-4">
        <div className="newsletter__inner bg-white rounded-lg p-6 border flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="newsletter__info">
            <h3 className="newsletter__title text-lg font-semibold text-gray-900">{t('newsletter.title')}</h3>
            <p className="newsletter__desc text-sm text-gray-600">{t('newsletter.subtitle')}</p>
          </div>

          <form onSubmit={onSubmit} className="newsletter__form flex w-full md:w-auto gap-2">
            <input
              className="newsletter__input rounded-md border px-3 py-2"
              placeholder={t('newsletter.placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label={t('newsletter.emailAria')}
            />
            <Button type="submit">{t('newsletter.subscribe')}</Button>
          </form>

          {error && <div className="newsletter__error text-red-600 text-sm">{error}</div>}
          {success && <div className="newsletter__success text-green-600 text-sm">{t('newsletter.subscribed')}</div>}
        </div>
      </div>
    </section>
  )
}
