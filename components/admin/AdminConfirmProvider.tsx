'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  const [options, setOptions] = useState<AdminConfirmOptions | null>(null)
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const resolver = useRef<Resolver | null>(null)
  const open = useCallback((next: AdminConfirmOptions) => new Promise<AdminConfirmResult>((resolve) => {
    resolver.current?.({ confirmed: false })
    resolver.current = resolve; setTyped(''); setReason(''); setOptions(next)
  }), [])
  const close = (confirmed: boolean) => {
    resolver.current?.({ confirmed, reason: confirmed ? reason.trim() || undefined : undefined })
    resolver.current = null; setOptions(null)
  }
  const valid = (!options?.confirmText || typed === options.confirmText) && (!options?.requireReason || reason.trim().length >= 5)
  return <Context.Provider value={open}>{children}{options && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(false) }}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description" className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl">
      <div className="flex gap-3"><AlertTriangle className={`mt-0.5 h-6 w-6 shrink-0 ${options.destructive ? 'text-red-600' : 'text-amber-600'}`} /><div><h2 id="admin-confirm-title" className="text-lg font-semibold">{options.title}</h2><p id="admin-confirm-description" className="mt-1 text-sm text-muted-foreground">{options.description}</p></div></div>
      {options.affected?.length ? <div className="mt-4 rounded-lg bg-muted p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Затронутые объекты ({options.affected.length})</p><ul className="mt-2 max-h-28 overflow-auto text-sm">{options.affected.slice(0, 20).map((item) => <li key={item} className="truncate">• {item}</li>)}</ul>{options.affected.length > 20 && <p className="mt-1 text-xs text-muted-foreground">И ещё {options.affected.length - 20}</p>}</div> : null}
      {options.requireReason && <label htmlFor="admin-confirm-reason" className="mt-4 block text-sm font-medium">Причина изменения<Input id="admin-confirm-reason" className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Минимум 5 символов" maxLength={500} /></label>}
      {options.confirmText && <label htmlFor="admin-confirm-text" className="mt-4 block text-sm font-medium">Введите <strong>{options.confirmText}</strong> для подтверждения<Input id="admin-confirm-text" className="mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => close(false)}>Отмена</Button><Button variant={options.destructive ? 'destructive' : 'default'} disabled={!valid} onClick={() => close(true)}>{options.confirmLabel ?? 'Подтвердить'}</Button></div>
    </div>
  </div>}</Context.Provider>
}
