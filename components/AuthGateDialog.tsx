'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'
import LoginForm from '@/components/auth/LoginForm'
import RegisterSwitcher from '@/components/auth/RegisterSwitcher'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

type View = 'gate' | 'login' | 'register' | 'forgot'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AuthGateDialog({ open, onOpenChange }: Props): React.ReactElement {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('gate')

  const handleOpenChange = (next: boolean) => {
    if (!next) setView('gate')
    onOpenChange(next)
  }

  const handleLoginSuccess = () => {
    handleOpenChange(false)
  }

  const title: Record<View, string> = {
    gate: t('authGate.title'),
    login: t('auth.login'),
    register: t('auth.register'),
    forgot: t('auth.resetPassword'),
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="auth-gate-dialog sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title[view]}</DialogTitle>
        </DialogHeader>

        {view === 'gate' && (
          <div className="auth-gate-dialog__gate">
            <p className="auth-gate-dialog__description text-sm text-muted-foreground mb-4">
              {t('authGate.description')}
            </p>
            <div className="auth-gate-dialog__actions flex flex-col gap-3">
              <Button className="w-full" onClick={() => setView('login')}>
                {t('auth.login')}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setView('register')}>
                {t('auth.registerButton')}
              </Button>
            </div>
          </div>
        )}

        {view === 'login' && (
          <div className="auth-gate-dialog__login">
            <LoginForm
              onSuccess={handleLoginSuccess}
              onForgotPassword={() => setView('forgot')}
              onClose={() => setView('gate')}
            />
          </div>
        )}

        {view === 'register' && (
          <div className="auth-gate-dialog__register">
            <RegisterSwitcher onClose={() => handleOpenChange(false)} />
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setView('gate')}
            >
              ← {t('common.back')}
            </Button>
          </div>
        )}

        {view === 'forgot' && (
          <div className="auth-gate-dialog__forgot">
            <ForgotPasswordForm />
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setView('login')}
            >
              ← {t('common.back')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
