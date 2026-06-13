'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

/**
 * Shared UI for route-segment error boundaries (error.tsx files). Keeps the rest of the app
 * (header, nav) alive while showing a scoped, recoverable error for the failed segment.
 */
export default function RouteError({
  error,
  reset,
  homeHref = '/',
}: {
  error: Error
  reset: () => void
  homeHref?: string
}) {
  const { t } = useTranslation()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="mb-4 text-5xl">⚠️</div>
      <h1 className="mb-3 text-2xl font-bold text-foreground">{t('error.title')}</h1>
      <p className="mb-6 text-muted-foreground">{t('error.description')}</p>
      <div className="mb-6 rounded-lg border border-border bg-muted p-3 text-left">
        <p className="break-words font-mono text-sm text-destructive">{error.message}</p>
      </div>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button onClick={reset} size="lg">
          🔄 {t('error.tryAgain')}
        </Button>
        <Link href={homeHref}>
          <Button variant="outline" size="lg">
            {t('notFound.home')}
          </Button>
        </Link>
      </div>
    </div>
  )
}
