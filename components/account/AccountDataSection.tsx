'use client'

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useLocaleHelpers } from '@/hooks/useLocaleHelpers'
import { logout } from '@/lib/auth'

export function AccountDataSection(): React.ReactElement {
  const { tl } = useLocaleHelpers()
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)

  const handleDelete = async (): Promise<void> => {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/user', { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(
          body.error === 'admin_cannot_self_delete'
            ? tl('account.data.deleteAdminBlocked', 'Аккаунт администратора нельзя удалить здесь.', 'Admin accounts cannot be deleted here.', 'Administratora kontu šeit nevar dzēst.')
            : tl('account.data.deleteFailed', 'Не удалось удалить аккаунт. Попробуйте позже.', 'Could not delete the account. Try again later.', 'Neizdevās dzēst kontu. Mēģiniet vēlāk.')
        )
        setDeleting(false)
        return
      }
      // Session is already invalidated server-side; clear local state and leave.
      logout()
      router.replace('/')
    } catch {
      setError(tl('account.data.deleteFailed', 'Не удалось удалить аккаунт. Попробуйте позже.', 'Could not delete the account. Try again later.', 'Neizdevās dzēst kontu. Mēģiniet vēlāk.'))
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <h3 className="text-lg font-semibold text-foreground">
        {tl('account.data.title', 'Данные и конфиденциальность', 'Data & privacy', 'Dati un privātums')}
      </h3>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a
          href="/api/user/export"
          download
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {tl('account.data.exportPdf', 'Отчёт о данных аккаунта (PDF)', 'Account data report (PDF)', 'Konta datu pārskats (PDF)')}
        </a>
        <Button
          ref={deleteTriggerRef}
          variant="outline"
          onClick={() => { setError(null); setAcknowledged(false); setConfirmOpen(true) }}
          className="border-gray-200 bg-transparent text-muted-foreground shadow-none hover:border-red-200 hover:bg-red-50/50 hover:text-red-600 dark:border-gray-700 dark:hover:border-red-900/70 dark:hover:bg-red-950/20 dark:hover:text-red-400"
        >
          {tl('account.data.delete', 'Удалить аккаунт', 'Delete account', 'Dzēst kontu')}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!deleting) setConfirmOpen(open) }}>
        <DialogContent
          className="max-w-md"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            deleteTriggerRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {tl('account.data.confirmTitle', 'Удалить аккаунт?', 'Delete your account?', 'Dzēst kontu?')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm text-muted-foreground">
            <p>
              {tl(
                'account.data.confirmBody',
                'Это действие необратимо. Ваши персональные данные будут удалены. История заказов сохраняется в обезличенном виде — она нужна для бухгалтерии и налогов.',
                'This is irreversible. Your personal data will be erased. Order history is kept in anonymised form as required for accounting and tax.',
                'Šī darbība ir neatgriezeniska. Jūsu personas dati tiks dzēsti. Pasūtījumu vēsture tiek saglabāta anonimizētā veidā grāmatvedības un nodokļu vajadzībām.'
              )}
            </p>
            <label className="flex items-start gap-2 text-foreground">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                {tl('account.data.confirmAck', 'Я понимаю, что это действие нельзя отменить.', 'I understand this cannot be undone.', 'Es saprotu, ka šo darbību nevar atsaukt.')}
              </span>
            </label>
            {error && (
              <p className="my-2 rounded-md bg-red-50 px-3 py-2 text-sm leading-5 text-red-600 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              {tl('account.data.cancel', 'Отмена', 'Cancel', 'Atcelt')}
            </Button>
            <Button
              onClick={handleDelete}
              disabled={!acknowledged || deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting
                ? tl('account.data.deleting', 'Удаление…', 'Deleting…', 'Dzēš…')
                : tl('account.data.deleteConfirm', 'Удалить навсегда', 'Delete permanently', 'Dzēst neatgriezeniski')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
