'use client'

import React, { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LineBadges, slugify } from './BrandLineTreePanel'
import type { BrandLinesAdmin, LineDetail } from './useBrandLinesAdmin'

const NO_PARENT = '__none__'

function EditForm({ admin, detail }: { admin: BrandLinesAdmin; detail: LineDetail }): React.ReactElement {
  const { l } = admin
  const line = detail.line
  const [names, setNames] = useState({ ru: line.names.ru ?? '', lv: line.names.lv ?? '', en: line.names.en ?? '', default: line.names.default ?? '' })
  const [slug, setSlug] = useState(line.slug)
  const [status, setStatus] = useState<string>(line.status)
  const [kind, setKind] = useState<string>(line.kind)
  const [parentId, setParentId] = useState(line.parentId ?? NO_PARENT)
  // Candidate parents: same brand, not the line itself or one of its descendants.
  const parents = useMemo(() => {
    const blocked = new Set([line.id])
    let grew = true
    while (grew) {
      grew = false
      for (const candidate of admin.lines) if (candidate.parentId && blocked.has(candidate.parentId) && !blocked.has(candidate.id)) { blocked.add(candidate.id); grew = true }
    }
    return admin.lines.filter(candidate => candidate.brandKey === line.brandKey && !blocked.has(candidate.id))
  }, [admin.lines, line])
  const save = (event: React.FormEvent): void => {
    event.preventDefault()
    void admin.actions.update(line.id, { names, slug, status, kind, parentId: parentId === NO_PARENT ? null : parentId })
  }
  return (
    <form onSubmit={save} className="grid gap-2 sm:grid-cols-2" aria-label={l('Редактирование линейки', 'Edit line', 'Līnijas labošana')}>
      {(['ru', 'lv', 'en'] as const).map(code => (
        <label key={code} className="text-sm">
          <span className="text-muted-foreground">{l('Название', 'Name', 'Nosaukums')} {code.toUpperCase()}</span>
          <Input value={names[code]} aria-label={`edit-name-${code}`} onChange={event => { const value = event.target.value; setNames(current => ({ ...current, [code]: value })) }} />
        </label>
      ))}
      <div className="text-sm">
        <label htmlFor="brand-line-edit-slug" className="text-muted-foreground">slug</label>
        <Input id="brand-line-edit-slug" value={slug} aria-label="edit-slug" onChange={event => setSlug(slugify(event.target.value))} />
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">{l('Родитель', 'Parent', 'Vecāklīnija')}</span>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger aria-label="edit-parent"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PARENT}>{l('— корневая линейка бренда —', '— top-level line of the brand —', '— zīmola augstākā līmeņa līnija —')}</SelectItem>
            {parents.map(candidate => <SelectItem key={candidate.id} value={candidate.id}>{'· '.repeat(candidate.depth - 1)}{admin.name(candidate.names)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">{l('Статус', 'Status', 'Statuss')}</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="edit-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{l('Активна', 'Active', 'Aktīva')}</SelectItem>
            <SelectItem value="archived">{l('Архив', 'Archived', 'Arhīvs')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">{l('Тип', 'Kind', 'Veids')}</span>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger aria-label="edit-kind"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="line">{l('Линейка', 'Line', 'Līnija')}</SelectItem>
            <SelectItem value="series">{l('Серия', 'Series', 'Sērija')}</SelectItem>
            <SelectItem value="subbrand">{l('Подбренд', 'Sub-brand', 'Apakšzīmols')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end sm:col-span-2">
        <Button type="submit" size="sm" disabled={admin.busy}>{l('Сохранить', 'Save', 'Saglabāt')}</Button>
      </div>
    </form>
  )
}

export default function BrandLineDetailPanel({ admin }: { admin: BrandLinesAdmin }): React.ReactElement {
  const { l, detail } = admin
  const [productRef, setProductRef] = useState('')
  if (!detail) {
    return <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">{l('Выберите линейку слева', 'Select a line on the left', 'Izvēlieties līniju kreisajā pusē')}</section>
  }
  const line = admin.lines.find(row => row.id === detail.line.id) ?? { ...detail.line, directProducts: 0, excludedProducts: 0, sourceCategoryIds: [] }
  // Keys are fixed at creation, so descendants are found through parentId, not key prefixes.
  const descendantIds = new Set<string>()
  for (let frontier = [line.id]; frontier.length;) {
    frontier = admin.lines.filter(row => row.parentId && frontier.includes(row.parentId)).map(row => row.id)
    frontier.forEach(id => descendantIds.add(id))
  }
  const derived = admin.lines.filter(row => descendantIds.has(row.id)).reduce((sum, row) => sum + row.directProducts, 0)
  const brand = admin.brands.find(row => row.key === line.brandKey)?.name ?? line.brandKey
  const title = (product: LineDetail['products'][number]['product']): string =>
    (admin.language === 'lv' && product.titleLv) || (admin.language === 'en' && product.titleEn) || product.title
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-label={l('Линейка', 'Line', 'Līnija')}>
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">{brand} · <code>{line.key}</code></p>
        <h2 className="text-xl font-semibold">{admin.name(line.names)}</h2>
        <LineBadges line={line} admin={admin} />
      </header>

      {/* Remount on another line or after a save, so the form starts from the stored values. */}
      <EditForm key={`${detail.line.id}:${detail.line.updatedAt ?? ''}`} admin={admin} detail={detail} />

      <div className="space-y-1 text-sm">
        <p className="font-semibold">{l('Источник данных', 'Data source', 'Datu avots')}</p>
        {detail.sources.length === 0 && <p className="text-muted-foreground">{l('Создана вручную, без категории hairshop.lv', 'Created manually, no hairshop.lv category', 'Izveidota manuāli, bez hairshop.lv kategorijas')}</p>}
        {detail.sources.map(source => (
          <p key={source.sourceCategoryId}>
            hairshop.lv #{source.sourceCategoryId} «{admin.name(source.names)}» · {source.origin}
            {!source.isPresent && <Badge variant="destructive" className="ml-2">{l('нет в последнем снимке', 'missing in last snapshot', 'nav pēdējā momentuzņēmumā')}</Badge>}
          </p>
        ))}
        {line.adminLocked && <p className="text-muted-foreground">{l('Изменения администратора защищены от перезаписи синхронизацией.', 'Administrator changes are protected from synchronization.', 'Administratora izmaiņas sinhronizācija nepārraksta.')}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">
          {l('Товары', 'Products', 'Produkti')}: {line.directProducts} {l('напрямую', 'direct', 'tieši')}
          {derived > 0 && <> · {derived} {l('через дочерние линейки', 'through child lines', 'caur apakšlīnijām')}</>}
        </p>
        <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (productRef) void admin.actions.membership(line.id, productRef.trim(), 'include').then(() => setProductRef('')) }}>
          <Input value={productRef} onChange={event => setProductRef(event.target.value)} placeholder={l('ID или SKU товара', 'Product ID or SKU', 'Produkta ID vai SKU')} aria-label="product-ref" />
          <Button type="submit" size="sm" disabled={admin.busy || !productRef}>{l('Добавить', 'Add', 'Pievienot')}</Button>
        </form>
        <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr><th className="p-2">ID</th><th className="p-2">{l('Товар', 'Product', 'Produkts')}</th><th className="p-2">{l('Источник', 'Source', 'Avots')}</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {detail.products.map(row => (
                <tr key={row.productId} className="border-t border-border" data-product-id={row.productId}>
                  <td className="p-2 font-mono text-xs">{row.productId}</td>
                  <td className="p-2">{title(row.product)}{!row.product.isActive && <span className="ml-1 text-xs text-muted-foreground">({l('неактивен', 'inactive', 'neaktīvs')})</span>}</td>
                  <td className="p-2">
                    <span className="flex flex-wrap gap-1">
                      <Badge variant={row.origin === 'admin' ? 'default' : 'secondary'}>{row.origin === 'admin' ? l('вручную', 'manual', 'manuāli') : l('синхронизация', 'sync', 'sinhronizācija')}</Badge>
                      {row.status === 'excluded' && <Badge variant="destructive">{l('исключён', 'excluded', 'izslēgts')}</Badge>}
                      {!row.isPresentInSource && <Badge variant="outline">{l('нет в источнике', 'not in source', 'nav avotā')} ×{row.missingSnapshotCount}</Badge>}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    {row.status === 'excluded'
                      ? <Button size="sm" variant="outline" disabled={admin.busy} onClick={() => void admin.actions.membership(line.id, row.productId, 'include')}>{l('Вернуть', 'Restore', 'Atjaunot')}</Button>
                      : <Button size="sm" variant="ghost" disabled={admin.busy} onClick={() => void admin.actions.membership(line.id, row.productId, 'exclude')}>{l('Исключить', 'Exclude', 'Izslēgt')}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
