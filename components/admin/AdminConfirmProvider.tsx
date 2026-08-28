'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
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
    {options && <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-xl p-5 shadow-2xl" role="alertdialog">
      <div className="flex items-start gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${options.destructive ? 'bg-red-50 text-red-600 dark:bg-red-950/50' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/50'}`}><AlertTriangle className="h-5 w-5" /></div><div className="min-w-0 pt-0.5"><DialogTitle className="text-lg font-semibold leading-snug">{options.title}</DialogTitle><DialogDescription className="mt-1.5 leading-relaxed">{options.description}</DialogDescription></div></div>
      {options.affected?.length ? <div className="mt-4 rounded-lg bg-muted p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">{l('Затронутые объекты', 'Affected items', 'Ietekmētie objekti')} ({options.affected.length})</p><ul className="mt-2 max-h-28 overflow-auto text-sm">{options.affected.slice(0, 20).map((item) => <li key={item} className="truncate">• {item}</li>)}</ul>{options.affected.length > 20 && <p className="mt-1 text-xs text-muted-foreground">{l('И ещё', 'And', 'Un vēl')} {options.affected.length - 20}</p>}</div> : null}
      {options.requireReason && <label htmlFor="admin-confirm-reason" className="mt-4 block text-sm font-medium">{l('Причина изменения', 'Reason for change', 'Izmaiņu iemesls')}<Input id="admin-confirm-reason" className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={l('Минимум 5 символов', 'At least 5 characters', 'Vismaz 5 rakstzīmes')} maxLength={500} /></label>}
      {options.confirmText && <label htmlFor="admin-confirm-text" className="mt-4 block text-sm font-medium">{l('Введите', 'Enter', 'Ievadiet')} <strong>{options.confirmText}</strong> {l('для подтверждения', 'to confirm', 'lai apstiprinātu')}<Input id="admin-confirm-text" className="mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>}
      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => close(false)}>{l('Отмена', 'Cancel', 'Atcelt')}</Button><Button variant={options.destructive ? 'destructive' : 'default'} disabled={!valid} onClick={() => close(true)}>{options.confirmLabel ?? l('Подтвердить', 'Confirm', 'Apstiprināt')}</Button></div>
    </DialogContent>}
  </Dialog></Context.Provider>
}
