'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAdminLocale } from '@/lib/use-admin-locale'

export type PromoOption = { value: string; label: string }

export function PromoMultiSelect({ label, options, selected, onChange, placeholder = 'Поиск…' }: {
  label: string
  options: PromoOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}): React.ReactElement {
  const { l } = useAdminLocale()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter((option) => !selected.includes(option.value) && (!q || option.label.toLowerCase().includes(q)))
  }, [options, query, selected])
  const labels = new Map(options.map((option) => [option.value, option.label]))

  return <div className="ui-disclosure-in space-y-2 sm:col-span-2">
    <p className="text-sm font-medium">{label}</p>
    {selected.length > 0 && <div className="ui-disclosure-in flex flex-wrap gap-2">
      {selected.map((value) => <span key={value} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
        {labels.get(value) ?? value}
        <button type="button" className="ml-1 hover:text-destructive" aria-label={`${l('Убрать', 'Remove', 'Noņemt')} ${labels.get(value) ?? value}`} onClick={() => onChange(selected.filter((item) => item !== value))}>×</button>
      </span>)}
    </div>}
    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder === 'Поиск…' ? l('Поиск…', 'Search…', 'Meklēt…') : placeholder} />
    <div className="max-h-64 overflow-y-auto rounded-md border border-border p-1">
      {filtered.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{l('Нет доступных вариантов', 'No options available', 'Nav pieejamu variantu')}</p> : filtered.map((option) =>
        <Button key={option.value} type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => { onChange([...selected, option.value]); setQuery('') }}>{option.label}</Button>
      )}
    </div>
    <p className="text-xs text-muted-foreground">{l('Показано:', 'Shown:', 'Parādīti:')} {filtered.length} {l('из', 'of', 'no')} {options.length}</p>
  </div>
}

export function usePromoCatalogOptions(): { brands: PromoOption[]; categories: PromoOption[]; subcategories: PromoOption[] } {
  const [brands, setBrands] = useState<PromoOption[]>([])
  const [categories, setCategories] = useState<PromoOption[]>([])
  const [subcategories, setSubcategories] = useState<PromoOption[]>([])
  useEffect(() => {
    fetch('/api/admin/promo-options').then((response) => response.json())
      .then((data) => {
        setBrands(data.brands ?? [])
        setCategories(data.categories ?? [])
        setSubcategories(data.subcategories ?? [])
      })
      .catch(() => undefined)
  }, [])
  return { brands, categories, subcategories }
}
