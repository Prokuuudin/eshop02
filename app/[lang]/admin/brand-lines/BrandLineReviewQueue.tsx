'use client'

import React, { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { slugify } from './BrandLineTreePanel'
import type { BrandLinesAdmin, ReviewItem } from './useBrandLinesAdmin'

const NO_PARENT = '__none__'
const LINE_REASONS = new Set(['unknown_root_line', 'brand_vs_line_conflict', 'ambiguous_new_series', 'new_series_too_deep'])
const BRAND_REASONS = new Set(['unknown_brand_category', 'unknown_manufacturer'])

function reasonLabel(admin: BrandLinesAdmin, reason: string): string {
  const { l } = admin
  const labels: Record<string, string> = {
    unknown_root_line: l('Неизвестная корневая линейка', 'Unknown top-level line', 'Nezināma augstākā līmeņa līnija'),
    brand_vs_line_conflict: l('Бренд или линейка? Нужно решение', 'Brand or line? Decision needed', 'Zīmols vai līnija? Nepieciešams lēmums'),
    ambiguous_new_series: l('Неоднозначная новая серия', 'Ambiguous new series', 'Neviennozīmīga jauna sērija'),
    new_series_too_deep: l('Серия слишком глубоко', 'Series nested too deep', 'Sērija pārāk dziļi'),
    unknown_brand_category: l('Неизвестная категория бренда', 'Unknown brand category', 'Nezināma zīmola kategorija'),
    unknown_manufacturer: l('Неизвестный производитель', 'Unknown manufacturer', 'Nezināms ražotājs'),
    hierarchy_divergence: l('Иерархия отличается от аудита', 'Hierarchy differs from the audit', 'Hierarhija atšķiras no audita'),
    product_brand_unknown: l('У товара не указан бренд', 'Product brand is unknown', 'Produkta zīmols nav norādīts'),
    product_brand_mismatch: l('Бренд товара не совпадает', 'Product brand mismatch', 'Produkta zīmols neatbilst'),
  }
  return labels[reason] ?? reason
}

function ReviewRow({ admin, item }: { admin: BrandLinesAdmin; item: ReviewItem }): React.ReactElement {
  const { l } = admin
  const details = item.details as { name?: string; brandKey?: string; parentKey?: string; otherBrand?: string; products?: number; productId?: string; lineKey?: string; seedParentKey?: string | null; sourceParentKey?: string | null }
  const subjectName = admin.name(item.categoryNames) !== '—' ? admin.name(item.categoryNames) : details.name ?? item.subjectKey
  const defaultParent = admin.lines.find(line => line.key === details.parentKey)?.id ?? NO_PARENT
  const [brandKey, setBrandKey] = useState(details.brandKey ?? '')
  const [parentId, setParentId] = useState(defaultParent)
  const [slug, setSlug] = useState(slugify(subjectName))
  const [note, setNote] = useState('')
  const open = item.status === 'open'
  const parents = admin.lines.filter(line => line.brandKey === brandKey && line.status === 'active')
  const act = (input: Record<string, unknown>): void => { void admin.actions.review(item.id, { ...input, ...(note ? { note } : {}) }) }
  return (
    <li className="space-y-2 rounded-md border border-border p-3" data-review-reason={item.reason} data-review-subject={item.subjectKey}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{reasonLabel(admin, item.reason)}</Badge>
        <span className="font-medium">{subjectName}</span>
        <span className="text-xs text-muted-foreground">#{item.subjectKey} · ×{item.occurrences}</span>
        {item.resolvedBy && <span className="text-xs text-muted-foreground">{item.status} · {item.resolvedBy}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {details.brandKey && <>{l('Бренд', 'Brand', 'Zīmols')}: {details.brandKey}. </>}
        {details.otherBrand && <>{l('Совпадает с брендом', 'Matches brand', 'Sakrīt ar zīmolu')}: {details.otherBrand}. </>}
        {details.parentKey && <>{l('Родитель', 'Parent', 'Vecāklīnija')}: {details.parentKey}. </>}
        {typeof details.products === 'number' && <>{l('Товаров', 'Products', 'Produkti')}: {details.products}. </>}
        {details.lineKey && <>{l('Линейка', 'Line', 'Līnija')}: {details.lineKey}. </>}
        {item.reason === 'hierarchy_divergence' && <>{l('Аудит', 'Audit', 'Audits')}: {details.seedParentKey ?? '—'} → {l('источник', 'source', 'avots')}: {details.sourceParentKey ?? '—'}</>}
      </p>
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          {(LINE_REASONS.has(item.reason) || BRAND_REASONS.has(item.reason)) && (
            <Select value={brandKey} onValueChange={value => { setBrandKey(value); setParentId(NO_PARENT) }}>
              <SelectTrigger className="w-56" aria-label="review-brand"><SelectValue placeholder={l('Бренд', 'Brand', 'Zīmols')} /></SelectTrigger>
              <SelectContent>{admin.brands.map(brand => <SelectItem key={brand.key} value={brand.key}>{brand.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {LINE_REASONS.has(item.reason) && (
            <>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="w-56" aria-label="review-parent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>{l('— корневая линейка —', '— top-level line —', '— augstākā līmeņa līnija —')}</SelectItem>
                  {parents.map(line => <SelectItem key={line.id} value={line.id}>{'· '.repeat(line.depth - 1)}{admin.name(line.names)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="w-48" value={slug} onChange={event => setSlug(slugify(event.target.value))} aria-label="review-slug" />
              <Button size="sm" disabled={admin.busy || !brandKey || !slug} onClick={() => act({ action: 'confirm_line', brandKey, parentId: parentId === NO_PARENT ? null : parentId, slug, kind: parentId === NO_PARENT ? 'line' : 'series' })}>
                {l('Создать линейку', 'Create line', 'Izveidot līniju')}
              </Button>
            </>
          )}
          {BRAND_REASONS.has(item.reason) && (
            <Button size="sm" disabled={admin.busy || !brandKey} onClick={() => act({ action: 'confirm_brand', brandKey })}>{l('Подтвердить бренд', 'Confirm brand', 'Apstiprināt zīmolu')}</Button>
          )}
          {(LINE_REASONS.has(item.reason) || BRAND_REASONS.has(item.reason))
            ? <Button size="sm" variant="outline" disabled={admin.busy} onClick={() => act({ action: 'reject' })}>{l('Отклонить', 'Reject', 'Noraidīt')}</Button>
            : <Button size="sm" variant="outline" disabled={admin.busy} onClick={() => act({ action: 'resolve' })}>{l('Принято', 'Acknowledge', 'Pieņemts')}</Button>}
          <Button size="sm" variant="ghost" disabled={admin.busy} onClick={() => act({ action: 'dismiss' })}>{l('Скрыть', 'Dismiss', 'Paslēpt')}</Button>
          <Input className="w-64" value={note} onChange={event => setNote(event.target.value)} placeholder={l('Комментарий (необязательно)', 'Note (optional)', 'Piezīme (nav obligāta)')} aria-label="review-note" />
        </div>
      )}
    </li>
  )
}

export default function BrandLineReviewQueue({ admin }: { admin: BrandLinesAdmin }): React.ReactElement {
  const { l } = admin
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label={l('Очередь проверки', 'Review queue', 'Pārbaudes rinda')}>
      <div className="flex flex-wrap gap-2">
        {(['open', 'resolved', 'dismissed'] as const).map(status => (
          <Button key={status} size="sm" variant={admin.reviewStatus === status ? 'default' : 'outline'} onClick={() => admin.actions.setReviewStatus(status)}>
            {status === 'open' ? l('Открытые', 'Open', 'Atvērtie') : status === 'resolved' ? l('Решённые', 'Resolved', 'Atrisinātie') : l('Скрытые', 'Dismissed', 'Paslēptie')}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {l('Товары новой линейки привязываются при следующей синхронизации.', 'Products of a new line are linked by the next synchronization.', 'Jaunas līnijas produkti tiek piesaistīti nākamajā sinhronizācijā.')}
      </p>
      {admin.reviews.length === 0 && <p className="text-sm text-muted-foreground">{l('Пунктов нет', 'No items', 'Punktu nav')}</p>}
      <ul className="space-y-2">{admin.reviews.map(item => <ReviewRow key={item.id} admin={admin} item={item} />)}</ul>
    </section>
  )
}
