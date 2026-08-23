'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AdminProductSearchItem } from '@/app/api/admin/products/search/route'

export function PromoProductPicker({ label, selected, onChange }: { label: string; selected: string[]; onChange: (ids: string[]) => void }): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminProductSearchItem[]>([])
  const [known, setKnown] = useState<Record<string, AdminProductSearchItem>>({})

  useEffect(() => {
    if (selected.length === 0) return
    fetch(`/api/admin/products/search?ids=${encodeURIComponent(selected.join(','))}`).then((response) => response.json()).then((json) => {
      const products: AdminProductSearchItem[] = json?.data?.products ?? []
      setKnown((current) => ({ ...current, ...Object.fromEntries(products.map((item) => [item.id, item])) }))
    }).catch(() => undefined)
  }, [selected.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`).then((response) => response.json()).then((json) => setResults(json?.data?.products ?? [])).catch(() => setResults([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  return <div className="space-y-2 sm:col-span-2">
    <p className="text-sm font-medium">{label}</p>
    {selected.length > 0 && <div className="space-y-1">
      {selected.map((id) => <div key={id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{known[id]?.title ?? `Товар ${id}`}</span>
        <span className="text-xs text-muted-foreground">{known[id]?.brand}</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(selected.filter((item) => item !== id))}>Убрать</Button>
      </div>)}
    </div>}
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, бренд, SKU или ID…" />
    {query.trim().length >= 2 && <div className="max-h-56 overflow-y-auto rounded-md border border-border p-1">
      {results.filter((item) => !selected.includes(item.id)).map((item) => <Button key={item.id} type="button" variant="ghost" className="h-auto w-full justify-start px-2 py-2 text-left" onClick={() => { setKnown((current) => ({ ...current, [item.id]: item })); onChange([...selected, item.id]); setQuery(''); setResults([]) }}>
        <span className="min-w-0"><span className="block truncate">{item.title}</span><span className="block text-xs text-muted-foreground">{item.brand} · ID {item.id}</span></span>
      </Button>)}
      {results.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Ничего не найдено</p>}
    </div>}
  </div>
}
