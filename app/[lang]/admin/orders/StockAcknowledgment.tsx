'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { useAdminLocale } from '@/lib/use-admin-locale'

type State = { enabled: boolean; committed: number; awaiting: number; acknowledgedAt: string | null }

export function StockAcknowledgment({ orderId }: { orderId: string }): React.ReactElement | null {
  const { l } = useAdminLocale()
  const [state, setState] = React.useState<State | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    const response = await fetch(`/api/admin/orders/stock-acknowledgment?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('load_failed')
    setState(await response.json() as State)
  }, [orderId])

  React.useEffect(() => {
    let active = true
    fetch(`/api/admin/orders/stock-acknowledgment?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('load_failed')
        return response.json() as Promise<State>
      })
      .then((nextState) => { if (active) setState(nextState) })
      .catch(() => { if (active) setError('load_failed') })
    return () => { active = false }
  }, [orderId])
  if (!state?.enabled || (state.committed === 0 && state.awaiting === 0)) return null

  const acknowledge = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/admin/orders/stock-acknowledgment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'ack_failed')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ack_failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      {state.awaiting > 0 ? (
        <p>{l(
          `В GrinS подтверждено ${state.awaiting} шт.; удержание сохранится до подтверждённо свежего снимка.`,
          `${state.awaiting} pcs acknowledged in GrinS; the hold remains until a verified fresh snapshot.`,
          `GrinS apstiprinātas ${state.awaiting} gab.; aizturējums paliek līdz pārbaudītam jaunam momentuzņēmumam.`,
        )}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>{l(
            `К подтверждению в GrinS: ${state.committed} шт.`,
            `Ready to acknowledge in GrinS: ${state.committed} pcs.`,
            `Gatavs apstiprināšanai GrinS: ${state.committed} gab.`,
          )}</p>
          <Button size="sm" disabled={saving} onClick={acknowledge}>
            {saving
              ? l('Сохранение…', 'Saving…', 'Saglabā…')
              : l('Товар выписан в GrinS', 'Goods posted in GrinS', 'Preces iegrāmatotas GrinS')}
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-destructive">{l('Не удалось сохранить подтверждение.', 'Could not save acknowledgment.', 'Neizdevās saglabāt apstiprinājumu.')}</p>}
    </div>
  )
}
