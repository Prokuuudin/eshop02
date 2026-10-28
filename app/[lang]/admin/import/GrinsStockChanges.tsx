'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import type { ManualStockChange } from '@/lib/sync/manual-stock-preview'
import type { Localize } from './import-config'
import { COLLAPSED_STOCK_CHANGES, filterStockChanges, paginateStockChanges } from './grins-stock-changes'

export function GrinsStockChanges({ changes, l }: { changes: ManualStockChange[]; l: Localize }): React.ReactElement | null {
  const [expanded, setExpanded] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [requestedPage, setRequestedPage] = React.useState(1)
  const filtered = React.useMemo(() => filterStockChanges(changes, query), [changes, query])
  const pagination = paginateStockChanges(filtered, requestedPage)
  const visible = expanded || query.trim()
    ? pagination.items
    : changes.slice(0, COLLAPSED_STOCK_CHANGES)

  if (changes.length === 0) return null

  const collapse = () => {
    setExpanded(false)
    setQuery('')
    setRequestedPage(1)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">
          {l('Изменения остатков', 'Stock differences', 'Atlikumu atšķirības')} ({changes.length.toLocaleString()})
        </div>
        {changes.length > COLLAPSED_STOCK_CHANGES && (
          <Button type="button" variant="outline" size="sm" onClick={() => expanded ? collapse() : setExpanded(true)}>
            {expanded
              ? l('Свернуть до 10 изменений', 'Collapse to 10 changes', 'Sakļaut līdz 10 izmaiņām')
              : l('Показать все изменения остатков', 'Show all stock differences', 'Rādīt visas atlikumu atšķirības')}
          </Button>
        )}
      </div>

      <label className="block max-w-sm text-xs">
        <span className="mb-1 block text-muted-foreground">{l('Поиск по SKU', 'Search by SKU', 'Meklēt pēc SKU')}</span>
        <input
          type="search"
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            setRequestedPage(1)
            if (event.target.value.trim()) setExpanded(true)
          }}
          placeholder={l('SKU GrinS или локальный SKU', 'GrinS or local SKU', 'GrinS vai lokālais SKU')}
          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{l('Изменения с таким SKU не найдены.', 'No differences match this SKU.', 'Atšķirības ar šādu SKU nav atrastas.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{l('SKU GrinS', 'GrinS SKU', 'GrinS SKU')}</th>
                <th className="px-3 py-2">{l('Локальный SKU', 'Local SKU', 'Lokālais SKU')}</th>
                <th className="px-3 py-2 text-right">{l('Текущий Product.stock', 'Current Product.stock', 'Pašreizējais Product.stock')}</th>
                <th className="px-3 py-2 text-right">{l('Входящий GrinS', 'Incoming GrinS', 'Ienākošais GrinS')}</th>
                <th className="px-3 py-2 text-right">{l('Разница', 'Delta', 'Starpība')}</th>
                <th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2">{l('Проверка', 'Review', 'Pārbaude')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((change, index) => {
                const localSku = change.localSku && change.localSku !== change.externalId ? change.localSku : null
                const percentage = change.percentageChange === null
                  ? '—'
                  : `${change.percentageChange > 0 ? '+' : ''}${change.percentageChange.toFixed(2)}%`
                const marker = change.largeDifference
                  ? l('Расхождение более 50%', 'Difference over 50%', 'Atšķirība pārsniedz 50%')
                  : change.zeroTransition === 'to-zero'
                    ? l('Переход в ноль', 'Drops to zero', 'Pāreja uz nulli')
                    : change.zeroTransition === 'from-zero'
                      ? l('Переход из нуля', 'Rises from zero', 'Pāreja no nulles')
                      : '—'
                return (
                  <tr key={`${change.externalId}-${index}`} className={`border-t border-border ${change.largeDifference ? 'bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100' : ''}`}>
                    <td className="px-3 py-2 font-mono break-all">{change.externalId}</td>
                    <td className="px-3 py-2 font-mono break-all">{localSku ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{change.currentStock}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{change.incomingStock}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{change.delta > 0 ? '+' : ''}{change.delta}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{percentage}</td>
                    <td className="px-3 py-2 font-medium">{marker}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(expanded || query.trim()) && filtered.length > 0 && pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {l('Страница', 'Page', 'Lapa')} {pagination.page} / {pagination.totalPages} · {filtered.length.toLocaleString()} {l('изменений', 'differences', 'atšķirības')}
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
