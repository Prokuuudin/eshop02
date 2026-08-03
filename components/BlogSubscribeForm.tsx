'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

export default function BlogSubscribeForm(): React.ReactElement {
  const { t } = useTranslation()
  const [email, setEmail] = React.useState('')
  const [error, setError] = React.useState('')
  const [success, setSuccess] = React.useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setError('')
    setSuccess(false)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('newsletter.invalidEmail', 'Введите корректный email'))
      return
    }

    setSuccess(true)
    setEmail('')
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground"
          placeholder={t('newsletter.placeholder')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label={t('newsletter.emailAria')}
          aria-invalid={Boolean(error)}
          required
        />
        <Button size="lg" type="submit">{t('blog.subscribe')}</Button>
      </div>
      <div aria-live="polite">
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-3 text-sm text-green-700">{t('newsletter.subscribed')}</p>}
      </div>
    </form>
  )
}
