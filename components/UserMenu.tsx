'use client'
import React, { useState, useEffect } from 'react'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose } from './ui/dialog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { canAccessAdminPanel, getCurrentUser, hasAdminUsers, logout, type User } from '@/lib/auth'
import { Button } from './ui/button'
import { useTranslation } from '@/lib/use-translation'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

import RegisterForm from './auth/RegisterForm'
import LoginForm from './auth/LoginForm'
import ForgotPasswordForm from './auth/ForgotPasswordForm'

export default function UserMenu() {
  const [user, setUser] = useState<User | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const router = useRouter()
  const { t } = useTranslation()

  useEffect(() => {
    const syncUser = () => {
      const currentUser = getCurrentUser()
      setUser(currentUser)
      setSetupRequired(!hasAdminUsers())
    }

    syncUser()
    window.addEventListener('eshop-user-changed', syncUser as EventListener)
    return () => window.removeEventListener('eshop-user-changed', syncUser as EventListener)
  }, [])

  const handleLoginSuccess = () => {
    const currentUser = getCurrentUser()
    setUser(currentUser)
    setLoginOpen(false)
    setForgotOpen(false)
    setIsOpen(false)
  }

  const handleOpenForgotPassword = (): void => {
    setLoginOpen(false)
    setForgotOpen(true)
  }

  const handleLogout = () => {
    logout()
    setUser(null)
    router.push('/')
  }

  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (loginOpen || registerOpen || forgotOpen) {
        return
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, loginOpen, registerOpen, forgotOpen])

  return (
    <div className="relative" ref={menuRef}>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label={t('userMenu.aria')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 20c0-4 4-7 8-7s8 3 8 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {user && <span className="text-sm font-medium hidden sm:inline text-gray-900 dark:text-gray-100">{user.name || user.email.split('@')[0]}</span>}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('nav.account')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          {user ? (
            <>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name || t('auth.welcomeBack')}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">{user.email}</p>
              </div>
              <nav className="py-2">
                <Link href="/account" className="block px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-900 dark:text-gray-100">
                  {t('account.title')}
                </Link>
                {user.platformRole !== 'admin' && (
                  <Link href="/account#orders-history" className="block px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-900 dark:text-gray-100">
                    {t('account.myOrders')}
                  </Link>
                )}
                {canAccessAdminPanel(user) && (
                  <Link href="/admin" className="block px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-900 dark:text-gray-100">
                    {t('nav.admin')}
                  </Link>
                )}
              </nav>
              <div className="border-t px-4 py-2 border-gray-200 dark:border-gray-700">
                <Button onClick={handleLogout} variant="outline" className="w-full text-sm" size="sm">
                  {t('auth.logout')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="p-2 space-y-2">
                <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full" onClick={() => setLoginOpen(true)}>
                      {t('auth.login')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('auth.login')}</DialogTitle>
                    </DialogHeader>
                    <LoginForm onSuccess={handleLoginSuccess} onForgotPassword={handleOpenForgotPassword} />
                    <DialogClose asChild>
                      <Button variant="outline" className="mt-4 w-full">{t('common.close')}</Button>
                    </DialogClose>
                  </DialogContent>
                </Dialog>
                <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('auth.resetPassword')}</DialogTitle>
                    </DialogHeader>
                    <ForgotPasswordForm />
                    <DialogClose asChild>
                      <Button variant="outline" className="mt-4 w-full">{t('common.close')}</Button>
                    </DialogClose>
                  </DialogContent>
                </Dialog>
                <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full" onClick={() => setRegisterOpen(true)}>
                      {t('auth.registerButton', t('auth.register'))}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('auth.register')}</DialogTitle>
                    </DialogHeader>
                    <RegisterForm />
                    <DialogClose asChild>
                      <Button variant="outline" className="mt-4 w-full">{t('common.close')}</Button>
                    </DialogClose>
                  </DialogContent>
                </Dialog>
                {setupRequired && (
                  <Link href="/auth/admin-setup" className="block text-center text-xs text-amber-700 dark:text-amber-400 hover:underline">
                    Первичная настройка admin
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
