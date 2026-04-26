'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCurrentUser, hasAdminUsers, isAdminUser, registerAdminUser } from '@/lib/auth'
import { useTranslation } from '@/lib/use-translation'

export default function AdminSetupPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const currentUser = getCurrentUser()
    if (currentUser && isAdminUser(currentUser)) {
      router.replace('/admin')
      return
    }

    if (hasAdminUsers()) {
      router.replace('/auth/login')
    }
  }, [router])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (password.length < 8) {
      setError(t('adminSetup.errorMinLength'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('adminSetup.errorPasswordMismatch'))
      return
    }

    setBusy(true)
    const result = registerAdminUser(email, password, name)

    if (!result.success) {
      setBusy(false)
      setError(result.error || t('adminSetup.errorCreateFailed'))
      return
    }

    setError('')
    router.push('/admin')
  }

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-md mx-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.22em] text-amber-700 dark:text-amber-400">Admin Setup</p>
        <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">{t('adminSetup.pageTitle')}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t('adminSetup.pageDesc')}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <label className="block text-sm">
            <span className="mb-1 block text-gray-900 dark:text-gray-100">{t('adminSetup.fieldName')}</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Admin" />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-900 dark:text-gray-100">{t('adminSetup.fieldEmail')}</span>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-900 dark:text-gray-100">{t('adminSetup.fieldPassword')}</span>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-gray-900 dark:text-gray-100">{t('adminSetup.fieldConfirmPassword')}</span>
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('adminSetup.creating') : t('adminSetup.submit')}
            </Button>
            <Link href="/auth/login">
              <Button type="button" variant="outline">{t('adminSetup.backToLogin')}</Button>
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}