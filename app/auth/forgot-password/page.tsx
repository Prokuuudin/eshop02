'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/use-translation'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-md mx-auto rounded-lg border bg-white dark:bg-gray-900 p-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">
          {t('auth.resetPassword')}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
          {t('auth.resetPasswordHint')}
        </p>

        <ForgotPasswordForm />

        <div className="mt-5 text-sm text-center">
          <Link href="/auth/login" className="text-indigo-600 hover:underline">
            {t('auth.login')}
          </Link>
        </div>
      </div>
    </main>
  )
}
