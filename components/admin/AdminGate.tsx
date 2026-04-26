'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { canAccessAdminPanel, getAdminAccessLevel, getCurrentUser, hasAdminUsers, type AdminAccessLevel, type User } from '@/lib/auth'
import { useTranslation } from '@/lib/use-translation'

type AdminGateProps = {
  children: React.ReactNode
  access?: 'partial' | 'full'
}

export default function AdminGate({ children, access = 'full' }: AdminGateProps) {
  const router = useRouter()
  const { language } = useTranslation()
  const [status, setStatus] = useState<'loading' | 'allowed' | 'forbidden' | 'unauthenticated' | 'setup-required'>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [accessLevel, setAccessLevel] = useState<AdminAccessLevel>('none')

  const labels = {
    ru: {
      loading: 'Проверка доступа к админке...',
      loginRequired: 'Требуется вход',
      loginRedirect: 'Выполняется переход на страницу авторизации. Если переход не сработал, откройте вход вручную.',
      goToLogin: 'Перейти ко входу',
      setupRequired: 'Нужна первичная настройка',
      setupRedirect: 'Выполняется переход на страницу создания администратора. Если переход не сработал, откройте ее вручную.',
      openSetup: 'Открыть настройку администратора',
      noRole: 'без роли',
      forbidden: 'Доступ запрещен',
      needFullAccess: 'Для входа нужен полный доступ администратора.',
      needPartialAccess: 'Для входа нужна роль менеджера или администратора.',
      goToAccount: 'Перейти в аккаунт',
      fullAccessWithUser: (email: string, role: string) => `Пользователь ${email} имеет роль ${role}. Для этого раздела нужен полный доступ администратора.`,
      partialAccessWithUser: (email: string) => `Пользователь ${email} не имеет доступа к админ-панели.`
    },
    en: {
      loading: 'Checking admin access...',
      loginRequired: 'Sign in required',
      loginRedirect: 'Redirecting to the sign-in page. If it does not work, open login manually.',
      goToLogin: 'Go to login',
      setupRequired: 'Initial setup required',
      setupRedirect: 'Redirecting to admin setup page. If it does not work, open it manually.',
      openSetup: 'Open admin setup',
      noRole: 'no role',
      forbidden: 'Access denied',
      needFullAccess: 'Full administrator access is required.',
      needPartialAccess: 'Manager or administrator role is required.',
      goToAccount: 'Go to account',
      fullAccessWithUser: (email: string, role: string) => `User ${email} has role ${role}. Full administrator access is required for this section.`,
      partialAccessWithUser: (email: string) => `User ${email} has no access to the admin panel.`
    },
    lv: {
      loading: 'Parbauda admin piekluvi...',
      loginRequired: 'Nepieciesama pieslegsanas',
      loginRedirect: 'Notiek novirzisana uz pieslegsanas lapu. Ja tas nestrada, atveriet pieslegsanos manuali.',
      goToLogin: 'Doties uz pieslegsanos',
      setupRequired: 'Nepieciesama sakotneja iestatisana',
      setupRedirect: 'Notiek novirzisana uz administratora iestatisanas lapu. Ja tas nestrada, atveriet to manuali.',
      openSetup: 'Atvert administratora iestatisanu',
      noRole: 'bez lomas',
      forbidden: 'Piekluve liegta',
      needFullAccess: 'Nepieciesama pilna administratora piekluve.',
      needPartialAccess: 'Nepieciesama menedzera vai administratora loma.',
      goToAccount: 'Doties uz kontu',
      fullAccessWithUser: (email: string, role: string) => `Lietotajam ${email} ir loma ${role}. Sai sadalai nepieciesama pilna administratora piekluve.`,
      partialAccessWithUser: (email: string) => `Lietotajam ${email} nav piekluves admin panelim.`
    }
  }[language]

  useEffect(() => {
    const syncUser = () => {
      try {
        const currentUser = getCurrentUser()
        setUser(currentUser)

        if (!currentUser) {
          setStatus(hasAdminUsers() ? 'unauthenticated' : 'setup-required')
          setAccessLevel('none')
          return
        }

        const level = getAdminAccessLevel(currentUser)
        setAccessLevel(level)

        if (access === 'full') {
          setStatus(level === 'admin' ? 'allowed' : 'forbidden')
          return
        }

        setStatus(canAccessAdminPanel(currentUser) ? 'allowed' : 'forbidden')
      } catch {
        setUser(null)
        setAccessLevel('none')
        setStatus('unauthenticated')
      }
    }

    syncUser()
    window.addEventListener('eshop-user-changed', syncUser as EventListener)
    return () => window.removeEventListener('eshop-user-changed', syncUser as EventListener)
  }, [access])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/auth/login')
    }
    if (status === 'setup-required') {
      router.replace('/auth/admin-setup')
    }
  }, [router, status])

  if (status === 'loading') {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 bg-white dark:bg-gray-900 text-center text-sm text-gray-600 dark:text-gray-300">
          {labels.loading}
        </div>
      </main>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 bg-white dark:bg-gray-900 text-center">
          <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{labels.loginRequired}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {labels.loginRedirect}
          </p>
          <Link href="/auth/login">
            <Button variant="outline">{labels.goToLogin}</Button>
          </Link>
        </div>
      </main>
    )
  }

  if (status === 'setup-required') {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 bg-white dark:bg-gray-900 text-center">
          <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{labels.setupRequired}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {labels.setupRedirect}
          </p>
          <Link href="/auth/admin-setup">
            <Button variant="outline">{labels.openSetup}</Button>
          </Link>
        </div>
      </main>
    )
  }

  if (status === 'forbidden') {
    const roleLabel = accessLevel === 'admin' ? 'admin' : accessLevel === 'manager' ? 'manager' : labels.noRole

    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 bg-white dark:bg-gray-900 text-center">
          <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{labels.forbidden}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {access === 'full'
              ? (user?.email
                ? labels.fullAccessWithUser(user.email, roleLabel)
                : labels.needFullAccess)
              : (user?.email
                ? labels.partialAccessWithUser(user.email)
                : labels.needPartialAccess)}
          </p>
          <Link href="/account">
            <Button variant="outline">{labels.goToAccount}</Button>
          </Link>
        </div>
      </main>
    )
  }

  return <>{children}</>
}