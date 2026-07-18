'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { readUsers, writeUsers } from '@/lib/auth'

type Phase = 'loading' | 'form' | 'success' | 'error'

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const token = searchParams.get('token') ?? ''

  useEffect(() => {
    if (!token) {
      setErrorMsg('Ссылка недействительна.')
      setPhase('error')
      return
    }

    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = (await res.json()) as { ok: boolean; error?: string }
        if (!json.ok) {
          setErrorMsg(
            json.error === 'token_expired'
              ? 'Ссылка устарела. Запросите сброс пароля заново.'
              : 'Ссылка недействительна или уже была использована.'
          )
          setPhase('error')
          return
        }
        setPhase('form')
      })
      .catch(() => {
        setErrorMsg('Ошибка соединения. Попробуйте ещё раз.')
        setPhase('error')
      })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setErrorMsg('Пароль должен быть не менее 6 символов.')
      return
    }
    if (password !== password2) {
      setErrorMsg('Пароли не совпадают.')
      return
    }
    setErrorMsg('')
    setSubmitting(true)

    try {
      // Password is set server-side (bcrypt hash in DB) — the token and the new password go
      // together so the real credential actually changes.
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const json = (await res.json()) as { ok: boolean; email?: string; error?: string }

      if (!json.ok || !json.email) {
        setErrorMsg(
          json.error === 'token_expired'
            ? 'Ссылка устарела. Запросите сброс пароля заново.'
            : json.error === 'password_too_short'
              ? 'Пароль должен быть не менее 6 символов.'
              : 'Ссылка недействительна или уже была использована.'
        )
        setSubmitting(false)
        return
      }

      // Keep any local mirror consistent; the DB is the source of truth from here.
      const users = readUsers()
      const idx = users.findIndex((u) => u.email.toLowerCase() === json.email!.toLowerCase())
      if (idx !== -1) {
        users[idx] = { ...users[idx], password: '', mustChangePassword: false }
        writeUsers(users)
      }

      setPhase('success')
      setTimeout(() => router.push('/auth/login'), 2500)
    } catch {
      setErrorMsg('Ошибка соединения. Попробуйте ещё раз.')
      setSubmitting(false)
    }
  }

  if (phase === 'loading') {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <p className="text-muted-foreground text-sm animate-pulse">Проверяем ссылку…</p>
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <p className="text-red-600 dark:text-red-400">{errorMsg}</p>
          <Link
            href="/auth/forgot-password"
            className="inline-block text-primary hover:underline text-sm"
          >
            Запросить новую ссылку
          </Link>
        </div>
      </main>
    )
  }

  if (phase === 'success') {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">✓</div>
          <h1 className="text-xl font-semibold text-foreground">Пароль обновлён!</h1>
          <p className="text-muted-foreground text-sm">
            Сейчас вы будете перенаправлены на страницу входа.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-md mx-auto rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-bold mb-5 text-foreground">Новый пароль</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && <p className="text-red-600 dark:text-red-400 text-sm">{errorMsg}</p>}
          <div>
            <label className="block mb-1 text-sm text-foreground">
              Новый пароль
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-card text-foreground border-border"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm text-foreground">
              Повторите пароль
            </label>
            <Input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              minLength={6}
              className="w-full bg-card text-foreground border-border"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Сохраняем…' : 'Сохранить пароль'}
          </Button>
        </form>
        <div className="mt-5 text-sm text-center">
          <Link href="/auth/login" className="text-primary hover:underline">
            Войти
          </Link>
        </div>
      </div>
    </main>
  )
}
