'use client'

import { useId, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { COMPANY } from '@/data/company'
import { useUnprefixedPathname } from '@/lib/i18n-context'
import { useTranslation } from '@/lib/use-translation'

// Shared by every language; each storage area represents its own dismissal scope.
const STORAGE_KEY = 'hairshoppro.launch-notice.dismissed'
const EXCLUDED_ROUTES = ['/admin', '/auth', '/checkout', '/payment', '/order', '/account']

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

function getVisibleSnapshot(): boolean {
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    try {
      if (window[area].getItem(STORAGE_KEY) === '1') return false
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }
  return true
}

// The server and hydration render both omit the notice.
const getServerSnapshot = (): boolean => false

export default function StoreLaunchNotice(): React.ReactElement | null {
  const { t } = useTranslation()
  const pathname = useUnprefixedPathname()
  const titleId = useId()
  const visible = useSyncExternalStore(subscribe, getVisibleSnapshot, getServerSnapshot)
  const [closed, setClosed] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  function dismiss(): void {
    try {
      window[dontShowAgain ? 'localStorage' : 'sessionStorage'].setItem(STORAGE_KEY, '1')
    } catch {
      // Closing still works when browser storage is unavailable.
    }
    setClosed(true)
  }

  if (closed || !visible || EXCLUDED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return null
  }

  return (
    <section aria-labelledby={titleId} className="mx-auto mt-3 w-full max-w-[1440px] px-4">
      <div className="relative rounded-lg border border-border bg-muted/50 px-4 py-3 pr-14 text-sm text-foreground">
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('launchNotice.close')}
          className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="leading-5">
          <h2 id={titleId} className="inline font-semibold">{t('launchNotice.title')}</h2>{' '}
          <p className="inline">
            {t('launchNotice.body')}{' '}
            {t('launchNotice.feedback')}{' '}
            <a href={`mailto:${COMPANY.email}`} className="whitespace-nowrap rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t('launchNotice.contact')}
            </a>
          </p>
        </div>
        <label className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} className="h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <span>{t('launchNotice.dontShowAgain')}</span>
        </label>
      </div>
    </section>
  )
}
