'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import type { ManualPriceChange } from '@/lib/sync/manual-import'
import type { Localize } from './import-config'
import { COLLAPSED_PRICE_CHANGES, filterPriceChanges, paginatePriceChanges } from './grins-price-changes'

export function GrinsPriceChanges({ changes, l }: { changes: ManualPriceChange[]; l: Localize }): React.ReactElement | null {
  const [expanded, setExpanded] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [requestedPage, setRequestedPage] = React.useState(1)
  const filtered = React.useMemo(() => filterPriceChanges(changes, query), [changes, query])
  const pagination = paginatePriceChanges(filtered, requestedPage)
  const visible = expanded ? pagination.items : changes.slice(0, COLLAPSED_PRICE_CHANGES)

  if (changes.length === 0) return null

  const collapse = () => {
    setExpanded(false)
    setQuery('')
    setRequestedPage(1)
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-sans font-semibold">
          {l('Изменения цен', 'Price changes', 'Cenu izmaiņas')} ({changes.length.toLocaleString()})
        </div>
        {changes.length > COLLAPSED_PRICE_CHANGES && (
          <Button type="button" variant="outline" size="sm" onClick={() => expanded ? collapse() : setExpanded(true)}>
            {expanded
              ? l('Свернуть до 10 изменений', 'Collapse to 10 changes', 'Sakļaut līdz 10 izmaiņām')
              : l('Показать все изменения цен', 'Show all price changes', 'Rādīt visas cenu izmaiņas')}
          </Button>
        )}
      </div>

      {expanded && (
        <label className="block max-w-sm font-sans text-xs">
          <span className="mb-1 block text-muted-foreground">{l('Поиск по SKU', 'Search by SKU', 'Meklēt pēc SKU')}</span>
          <input
            type="search"
            value={query}
            onChange={event => { setQuery(event.target.value); setRequestedPage(1) }}
            placeholder={l('SKU GrinS или локальный SKU', 'GrinS or local SKU', 'GrinS vai lokālais SKU')}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}

      {expanded && filtered.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground">{l('Изменения с таким SKU не найдены.', 'No changes match this SKU.', 'Izmaiņas ar šādu SKU nav atrastas.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-muted/50 font-sans text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{l('SKU GrinS', 'GrinS SKU', 'GrinS SKU')}</th>
                <th className="px-3 py-2">{l('Локальный SKU', 'Local SKU', 'Lokālais SKU')}</th>
                <th className="px-3 py-2 text-right">{l('Старая цена', 'Old price', 'Vecā cena')}</th>
                <th className="px-3 py-2 text-right">{l('Новая цена', 'New price', 'Jaunā cena')}</th>
                <th className="px-3 py-2 text-right">{l('Изменение', 'Change', 'Izmaiņa')}</th>
                <th className="px-3 py-2">{l('Проверка', 'Review', 'Pārbaude')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((change, index) => {
                const localSku = change.localSku && change.localSku !== change.externalId ? change.localSku : null
                const percentage = change.percentageChange === null
                  ? '—'
                  : `${change.percentageChange > 0 ? '+' : ''}${change.percentageChange.toFixed(2)}%`
                return (
                  <tr key={`${change.externalId}-${index}`} className={`border-t border-border ${change.largeChange ? 'bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100' : ''}`}>
                    <td className="px-3 py-2 font-mono break-all">{change.externalId}</td>
                    <td className="px-3 py-2 font-mono break-all">{localSku ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">€{change.before}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">€{change.after}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">{percentage}</td>
                    <td className="px-3 py-2 font-sans font-medium">
                      {change.largeChange ? l('Изменение более 50%', 'Change over 50%', 'Izmaiņa pārsniedz 50%') : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {expanded && filtered.length > 0 && pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 font-sans text-xs text-muted-foreground">
          <span>
            {l('Страница', 'Page', 'Lapa')} {pagination.page} / {pagination.totalPages} · {filtered.length.toLocaleString()} {l('изменений', 'changes', 'izmaiņas')}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pagination.page === 1} onClick={() => setRequestedPage(pagination.page - 1)}>
              {l('Назад', 'Previous', 'Atpakaļ')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pagination.page === pagination.totalPages} onClick={() => setRequestedPage(pagination.page + 1)}>
              {l('Далее', 'Next', 'Tālāk')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
