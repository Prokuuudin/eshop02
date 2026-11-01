"use client";
import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { useTranslation } from '@/lib/use-translation'
import { localizePath } from '@/lib/i18n-routing'
import { useAuthStore } from '@/lib/auth-store'
import { useNotificationsStore } from '@/lib/notifications-store'

type NewsletterProps = {
  compact?: boolean
  embedded?: boolean
  registration?: boolean
  showcase?: boolean
}

export default function Newsletter({ compact = false, embedded = false, registration = false, showcase = false }: NewsletterProps): React.ReactElement {
  const { t, language } = useTranslation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isSubscribedToStoreNotifications = useNotificationsStore((state) => state.isSubscribed)
  const subscribeToStoreNotifications = useNotificationsStore((state) => state.subscribe)
  const addStoreNotification = useNotificationsStore((state) => state.addNotification)
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
        showcase
          ? `newsletter__inner newsletter__inner--showcase relative flex min-h-[176px] h-full flex-col justify-center gap-4 bg-emerald-600 px-5 py-6 pl-[160px] sm:min-h-[152px] sm:px-8 sm:pl-[190px] lg:min-h-[136px] lg:gap-5 dark:bg-emerald-700 ${embedded ? 'lg:items-start lg:px-7' : 'lg:flex-row lg:items-center lg:pl-[250px] lg:pr-9'} ${embedded ? '' : 'rounded-xl'}`
          : compact
          ? `newsletter__inner newsletter__inner--compact h-full bg-white p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 ${embedded ? '' : 'rounded-lg border'}`
          : 'newsletter__inner bg-white rounded-lg p-6 border flex flex-col md:flex-row md:items-center gap-6'
      }
    >
      <div className={`newsletter__info relative z-20 ${showcase ? 'min-w-0 flex-1' : 'md:flex-1'}`}>
        <h3 className={`newsletter__title ${showcase ? 'text-xl font-bold leading-tight text-amber-300 sm:text-2xl' : `font-semibold text-gray-900 ${compact ? 'text-base' : 'text-lg'}`}`}>{t('newsletter.title')}</h3>
        <p className={`newsletter__desc ${showcase ? 'mt-1 text-sm leading-snug text-white/90 sm:text-base' : `text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}`}>{t('newsletter.subtitle')}</p>
      </div>

      <div className={`newsletter__action relative z-20 ${showcase ? 'shrink-0' : 'md:flex-1'}`}>
        {registration ? (
          <Button
            asChild
            variant={showcase ? 'outline' : 'default'}
            className={showcase ? 'w-full rounded-full border-white bg-transparent px-7 uppercase tracking-wide text-white shadow-none hover:bg-white/10 hover:text-white sm:w-auto' : 'w-full'}
          >
            {isAuthenticated ? (
              <Link
                href={`${localizePath('/account', language)}#store-notifications`}
                onClick={() => {
                  if (!isSubscribedToStoreNotifications) {
                    subscribeToStoreNotifications()
                    addStoreNotification({ type: 'info', title: t('notifications.demo3Title'), message: t('notifications.demo3Message') })
                    addStoreNotification({ type: 'promo', title: t('notifications.demo2Title'), message: t('notifications.demo2Message') })
                    addStoreNotification({ type: 'info', title: t('notifications.demoTitle'), message: t('notifications.demoMessage') })
                  }
                }}
              >
                {t('newsletter.subscribe')}
              </Link>
            ) : (
              <Link href={localizePath('/auth/register', language)}>{t('newsletter.subscribe')}</Link>
            )}
          </Button>
        ) : <>
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
        </>}
      </div>
    </div>
  )

  if (compact) {
    return <div className="newsletter newsletter--compact h-full">{inner}</div>
  }

  return (
    <section className="newsletter py-8">
      <div className="mx-auto w-full max-w-[1200px] px-4">{inner}</div>
    </section>
  )
}
