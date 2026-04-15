import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/use-translation'

export default function ForgotPasswordForm() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    setSent(true)
  }

  return sent ? (
    <div className="rounded border border-green-200 bg-green-50 text-green-700 p-3 text-sm">
      {t('auth.resetLinkSent')}
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-gray-900 p-4 rounded-lg">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t('auth.resetPasswordHint')}
      </p>
      <div>
        <label className="block mb-1 text-sm text-gray-900 dark:text-gray-100">{t('auth.email')}</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full p-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
        />
      </div>
      <Button type="submit" className="w-full">
        {t('auth.sendResetLink')}
      </Button>
    </form>
  )
}
