'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert, WifiOff, X } from 'lucide-react'
import type { AdminUiError } from '@/lib/admin-ui-errors'
import { useAdminLocale } from '@/lib/use-admin-locale'

export default function AdminErrorCenter(): React.ReactElement | null {
  const { l } = useAdminLocale()
  const [errors, setErrors] = useState<Array<AdminUiError & { id: number }>>([])
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AdminUiError>).detail
      setErrors((current) => [...current.slice(-2), { ...detail, id: Date.now() + Math.random() }])
    }
    window.addEventListener('admin-ui-error', handler)
    return () => window.removeEventListener('admin-ui-error', handler)
  }, [])
  if (!errors.length) return null
  return <div className="fixed right-4 top-20 z-50 w-[min(420px,calc(100vw-2rem))] space-y-2" role="region" aria-label={l('Ошибки загрузки', 'Loading errors', 'Ielādes kļūdas')}>
    {errors.map((error) => {
      const Icon = error.kind === 'forbidden' ? ShieldAlert : error.kind === 'network' ? WifiOff : AlertTriangle
      return <div key={error.id} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 shadow-lg dark:border-red-800 dark:bg-red-950 dark:text-red-100">
        <div className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold">{error.kind === 'partial' ? l('Операция выполнена частично', 'Operation completed partially', 'Darbība izpildīta daļēji') : error.context ?? l('Ошибка загрузки', 'Loading error', 'Ielādes kļūda')}</p><p className="mt-1">{error.message}</p>{error.status ? <p className="mt-1 text-xs opacity-70">HTTP {error.status}</p> : null}</div><button aria-label={l('Закрыть', 'Close', 'Aizvērt')} onClick={() => setErrors((items) => items.filter((item) => item.id !== error.id))}><X className="h-4 w-4" /></button></div>
      </div>
    })}
  </div>
}
