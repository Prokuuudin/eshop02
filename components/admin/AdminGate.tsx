'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getCurrentUser, hasAdminUsers, isAdminUser, type User } from '@/lib/auth'

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'allowed' | 'forbidden' | 'unauthenticated' | 'setup-required'>('loading')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const syncUser = () => {
      const currentUser = getCurrentUser()
      setUser(currentUser)

      if (!currentUser) {
        setStatus(hasAdminUsers() ? 'unauthenticated' : 'setup-required')
        return
      }

      setStatus(isAdminUser(currentUser) ? 'allowed' : 'forbidden')
    }

    syncUser()
    window.addEventListener('eshop-user-changed', syncUser as EventListener)
    return () => window.removeEventListener('eshop-user-changed', syncUser as EventListener)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
    }
    if (status === 'setup-required') {
      router.replace('/auth/admin-setup')
    }
  }, [router, status])

  if (status === 'loading' || status === 'unauthenticated' || status === 'setup-required') {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 bg-white dark:bg-gray-900 text-center text-sm text-gray-600 dark:text-gray-300">
          Проверка доступа к админке...
        </div>
      </main>
    )
  }

  if (status === 'forbidden') {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 bg-white dark:bg-gray-900 text-center">
          <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">Доступ запрещён</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {user?.email ? `Пользователь ${user.email} не имеет роли администратора.` : 'Для входа нужна роль администратора.'}
          </p>
          <Link href="/account">
            <Button variant="outline">Перейти в аккаунт</Button>
          </Link>
        </div>
      </main>
    )
  }

  return <>{children}</>
}