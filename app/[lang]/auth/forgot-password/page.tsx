'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/use-translation'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

export default function ForgotPasswordPage(): React.ReactElement {
  const { t } = useTranslation()

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-md mx-auto rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-bold mb-2 text-foreground">
          {t('auth.resetPassword')}
        </h1>
        <p className="text-sm text-muted-foreground mb-5">
          {t('auth.resetPasswordHint')}
        </p>

        <ForgotPasswordForm />

        <div className="mt-5 text-sm text-center">
          <Link href="/auth/login" className="text-primary hover:underline">
            {t('auth.login')}
          </Link>
        </div>
      </div>
    </main>
  )
}
