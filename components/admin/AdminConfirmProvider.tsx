'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAdminLocale } from '@/lib/use-admin-locale'

export type AdminConfirmOptions = {
  title: string
  description: string
  affected?: string[]
  confirmText?: string
  requireReason?: boolean
  destructive?: boolean
  confirmLabel?: string
}
export type AdminConfirmResult = { confirmed: boolean; reason?: string }
type Resolver = (result: AdminConfirmResult) => void
const Context = createContext<((options: AdminConfirmOptions) => Promise<AdminConfirmResult>) | null>(null)

export function useAdminConfirm(): (options: AdminConfirmOptions) => Promise<AdminConfirmResult> {
  const value = useContext(Context)
  if (!value) throw new Error('useAdminConfirm must be used inside AdminConfirmProvider')
  return value
}

export default function AdminConfirmProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { l } = useAdminLocale()
  const [options, setOptions] = useState<AdminConfirmOptions | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const resolver = useRef<Resolver | null>(null)
  const open = useCallback((next: AdminConfirmOptions) => new Promise<AdminConfirmResult>((resolve) => {
    resolver.current?.({ confirmed: false })
    resolver.current = resolve; setTyped(''); setReason(''); setOptions(next); setIsOpen(true)
  }), [])
  const close = (confirmed: boolean) => {
    resolver.current?.({ confirmed, reason: confirmed ? reason.trim() || undefined : undefined })
    resolver.current = null; setIsOpen(false)
  }
  useEffect(() => {
    if (isOpen || !options) return
    const timer = window.setTimeout(() => setOptions(null), 260)
    return () => window.clearTimeout(timer)
  }, [isOpen, options])
  const valid = (!options?.confirmText || typed === options.confirmText) && (!options?.requireReason || reason.trim().length >= 5)
  return <Context.Provider value={open}>{children}<Dialog open={isOpen} onOpenChange={(nextOpen) => { if (!nextOpen && isOpen) close(false) }}>
    {options && <DialogContent className="max-h-[85vh] max-w-xl gap-0 overflow-hidden rounded-2xl border-border p-0 shadow-2xl" role="alertdialog">
      <div className="flex items-start gap-4 border-b border-border px-6 py-5 pr-12">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${options.destructive ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'}`}>
          {options.destructive ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </div>
        <div className="min-w-0 pt-0.5">
          <DialogTitle className="text-xl font-semibold leading-snug">{options.title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm leading-relaxed">{options.description}</DialogDescription>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        {options.affected?.length ? <div className="overflow-hidden rounded-xl border border-border bg-muted/30"><div className="flex items-center justify-between border-b border-border bg-muted/60 px-3.5 py-2.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l('Выбранные позиции', 'Selected items', 'Atlasītās pozīcijas')}</p><span className="rounded-full bg-background px-2.5 py-0.5 text-xs font-semibold tabular-nums text-foreground shadow-sm">{options.affected.length}</span></div><ul className="max-h-52 divide-y divide-border overflow-y-auto">{options.affected.slice(0, 50).map((item, index) => <li key={`${item}-${index}`} className="flex items-start gap-2.5 px-3.5 py-2.5 text-sm"><span className="mt-0.5 min-w-6 text-right text-xs tabular-nums text-muted-foreground">{index + 1}.</span><span className="min-w-0 break-words text-foreground">{item}</span></li>)}</ul>{options.affected.length > 50 && <p className="border-t border-border px-3.5 py-2 text-xs text-muted-foreground">{l('И ещё', 'And', 'Un vēl')} {options.affected.length - 50}</p>}</div> : null}
        {options.requireReason && <label htmlFor="admin-confirm-reason" className="mt-4 block text-sm font-medium">{l('Причина изменения', 'Reason for change', 'Izmaiņu iemesls')}<Input id="admin-confirm-reason" className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={l('Минимум 5 символов', 'At least 5 characters', 'Vismaz 5 rakstzīmes')} maxLength={500} /></label>}
        {options.confirmText && <label htmlFor="admin-confirm-text" className="mt-4 block text-sm font-medium">{l('Введите', 'Enter', 'Ievadiet')} <strong>{options.confirmText}</strong> {l('для подтверждения', 'to confirm', 'lai apstiprinātu')}<Input id="admin-confirm-text" className="mt-1.5" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => close(false)}>{l('Отмена', 'Cancel', 'Atcelt')}</Button><Button variant={options.destructive ? 'destructive' : 'default'} disabled={!valid} onClick={() => close(true)}>{options.confirmLabel ?? l('Подтвердить', 'Confirm', 'Apstiprināt')}</Button></div>
    </DialogContent>}
  </Dialog></Context.Provider>
}
