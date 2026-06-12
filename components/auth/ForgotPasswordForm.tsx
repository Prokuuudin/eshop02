import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/use-translation'

export default function ForgotPasswordForm() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }

      if (!json.ok && json.error === 'invalid_email') {
        setError('Введите корректный e-mail.')
        return
      }

      setSent(true)
    } catch {
      setError('Ошибка соединения. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300 p-3 text-sm">
        {t('auth.resetLinkSent')}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-gray-900 p-4 rounded-lg">
      <p className="text-sm text-muted-foreground">{t('auth.resetPasswordHint')}</p>
      {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
      <div>
        <label className="block mb-1 text-sm text-foreground">
          {t('auth.email')}
        </label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full p-2 border rounded bg-white dark:bg-gray-800 text-foreground border-border"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Отправляем…' : t('auth.sendResetLink')}
      </Button>
    </form>
  )
}
