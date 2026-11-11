'use client'

import React, { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

type Phase = 'ready' | 'submitting' | 'success' | 'invalid' | 'failed'

// Opening this page sends nothing to the server: mail scanners open links too. The change
// happens only when the person presses the button, as a POST.
function ConfirmEmail(): React.ReactElement {
  const { t } = useTranslation()
  const token = useSearchParams().get('token') ?? ''
  const [phase, setPhase] = useState<Phase>(token ? 'ready' : 'invalid')

  const confirm = async (): Promise<void> => {
    setPhase('submitting')
    try {
      const res = await fetch('/api/user/email-change/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      setPhase(res.ok ? 'success' : res.status === 400 ? 'invalid' : 'failed')
    } catch {
      setPhase('failed')
    }
  }

  return (
    <main className="confirm-email flex min-h-[60vh] items-center justify-center px-4">
      <div className="confirm-email__card w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="confirm-email__title text-xl font-semibold text-foreground">{t('auth.confirmEmail.title')}</h1>
        {(phase === 'ready' || phase === 'submitting') && (
          <>
            <p className="text-sm text-muted-foreground">{t('auth.confirmEmail.intro')}</p>
            <Button type="button" className="w-full" disabled={phase === 'submitting'} onClick={() => void confirm()}>
              {t('auth.confirmEmail.confirm')}
            </Button>
          </>
        )}
        {phase === 'success' && (
          <>
            <p role="status" data-testid="confirm-email-success" className="text-sm text-emerald-700 dark:text-emerald-400">
              {t('auth.confirmEmail.success')}
            </p>
            {/* A full navigation, so the cached account is re-read from the server. */}
            <Button type="button" variant="outline" className="w-full" onClick={() => window.location.assign('/account/profile')}>
              {t('auth.confirmEmail.toAccount')}
            </Button>
          </>
        )}
        {phase === 'invalid' && (
          <p role="alert" data-testid="confirm-email-invalid" className="text-sm text-red-600 dark:text-red-400">
            {t('auth.confirmEmail.invalid')}
          </p>
        )}
        {phase === 'failed' && (
          <>
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('auth.confirmEmail.failed')}</p>
            <Button type="button" variant="outline" className="w-full" onClick={() => void confirm()}>
              {t('auth.confirmEmail.confirm')}
            </Button>
          </>
        )}
      </div>
    </main>
  )
}

export default function ConfirmEmailPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <ConfirmEmail />
    </Suspense>
  )
}
