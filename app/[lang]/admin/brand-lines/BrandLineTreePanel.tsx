'use client'

import React, { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AdminBrandLine, BrandLinesAdmin } from './useBrandLinesAdmin'

const NO_PARENT = '__none__'

export function slugify(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80)
}

export function LineBadges({ line, admin }: { line: AdminBrandLine; admin: BrandLinesAdmin }): React.ReactElement {
  const { l } = admin
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant={line.origin === 'admin' ? 'default' : 'secondary'}>
        {line.origin === 'admin' ? l('вручную', 'manual', 'manuāli') : l('синхронизация', 'sync', 'sinhronizācija')}
      </Badge>
      {line.adminLocked && line.origin !== 'admin' && <Badge variant="outline">{l('изменено админом', 'edited by admin', 'labojis administrators')}</Badge>}
      {line.status === 'archived' && <Badge variant="destructive">{l('архив', 'archived', 'arhīvs')}</Badge>}
    </span>
  )
}

function LineNode({ line, childrenOf, admin, depth }: { line: AdminBrandLine; childrenOf: Map<string | null, AdminBrandLine[]>; admin: BrandLinesAdmin; depth: number }): React.ReactElement {
  const children = childrenOf.get(line.id) ?? []
  const selected = admin.selectedId === line.id
  return (
    <li>
      <button
        type="button"
        onClick={() => admin.select(line.id)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${selected ? 'bg-muted font-semibold' : ''}`}
        style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
        data-line-key={line.key}
      >
        {children.length > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <span className="w-3.5 shrink-0" />}
        <span className="flex-1 truncate">{admin.name(line.names)}</span>
        <span className="text-xs text-muted-foreground">{line.directProducts}</span>
      </button>
      {children.length > 0 && (
        <ul>{children.map(child => <LineNode key={child.id} line={child} childrenOf={childrenOf} admin={admin} depth={depth + 1} />)}</ul>
      )}
    </li>
  )
}

function CreateLineForm({ admin }: { admin: BrandLinesAdmin }): React.ReactElement {
  const { l } = admin
  const [brandKey, setBrandKey] = useState('')
  const [parentId, setParentId] = useState(NO_PARENT)
  const [names, setNames] = useState({ ru: '', lv: '', en: '' })
  const [slug, setSlug] = useState('')
  const [kind, setKind] = useState('line')
  const parents = admin.lines.filter(line => line.brandKey === brandKey && line.status === 'active')
  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    void admin.actions.create({ brandKey, parentId: parentId === NO_PARENT ? null : parentId, slug, kind, names: { ...names, default: names.lv || names.ru || names.en } })
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-border p-3" aria-label={l('Новая линейка', 'New line', 'Jauna līnija')}>
      <p className="text-sm font-semibold">{l('Новая линейка', 'New line', 'Jauna līnija')}</p>
      <Select value={brandKey} onValueChange={value => { setBrandKey(value); setParentId(NO_PARENT) }}>
        <SelectTrigger aria-label={l('Бренд', 'Brand', 'Zīmols')}><SelectValue placeholder={l('Бренд', 'Brand', 'Zīmols')} /></SelectTrigger>
        <SelectContent>{admin.brands.map(brand => <SelectItem key={brand.key} value={brand.key}>{brand.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={parentId} onValueChange={setParentId} disabled={!brandKey}>
        <SelectTrigger aria-label={l('Родитель', 'Parent', 'Vecāklīnija')}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PARENT}>{l('— корневая линейка бренда —', '— top-level line of the brand —', '— zīmola augstākā līmeņa līnija —')}</SelectItem>
          {parents.map(line => <SelectItem key={line.id} value={line.id}>{'· '.repeat(line.depth - 1)}{admin.name(line.names)}</SelectItem>)}
        </SelectContent>
      </Select>
      {(['ru', 'lv', 'en'] as const).map(code => (
        <Input key={code} value={names[code]} placeholder={`${l('Название', 'Name', 'Nosaukums')} (${code.toUpperCase()})`} aria-label={`name-${code}`}
          onChange={event => { const value = event.target.value; setNames(current => ({ ...current, [code]: value })); if (code === 'lv' || (!names.lv && code === 'ru')) setSlug(slugify(value)) }} />
      ))}
      <Input value={slug} onChange={event => setSlug(slugify(event.target.value))} placeholder="slug" aria-label="slug" />
      <Select value={kind} onValueChange={setKind}>
        <SelectTrigger aria-label={l('Тип', 'Kind', 'Veids')}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="line">{l('Линейка', 'Line', 'Līnija')}</SelectItem>
          <SelectItem value="series">{l('Серия', 'Series', 'Sērija')}</SelectItem>
          <SelectItem value="subbrand">{l('Подбренд', 'Sub-brand', 'Apakšzīmols')}</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={admin.busy || !brandKey || !slug || !(names.ru || names.lv || names.en)}>{l('Создать', 'Create', 'Izveidot')}</Button>
    </form>
  )
}

export default function BrandLineTreePanel({ admin }: { admin: BrandLinesAdmin }): React.ReactElement {
  const { l } = admin
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, AdminBrandLine[]>()
    for (const line of admin.lines) map.set(line.parentId, [...(map.get(line.parentId) ?? []), line])
    return map
  }, [admin.lines])
  const brandsWithLines = admin.brands.filter(brand => admin.lines.some(line => line.brandKey === brand.key))
    .filter(brand => !search || brand.name.toLowerCase().includes(search.toLowerCase())
      || admin.lines.some(line => line.brandKey === brand.key && admin.name(line.names).toLowerCase().includes(search.toLowerCase())))
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label={l('Иерархия линеек', 'Line hierarchy', 'Līniju hierarhija')}>
      <div className="flex items-center gap-2">
        <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={l('Поиск бренда или линейки', 'Search brand or line', 'Meklēt zīmolu vai līniju')} />
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating(value => !value)}>{creating ? l('Скрыть', 'Hide', 'Paslēpt') : l('+ Линейка', '+ Line', '+ Līnija')}</Button>
      </div>
      {creating && <CreateLineForm admin={admin} />}
      {brandsWithLines.length === 0 && <p className="text-sm text-muted-foreground">{l('Линеек пока нет', 'No lines yet', 'Līniju vēl nav')}</p>}
      {brandsWithLines.map(brand => (
        <div key={brand.key}>
          <p className="px-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{brand.name}</p>
          <ul>{(childrenOf.get(null) ?? []).filter(line => line.brandKey === brand.key).map(line => <LineNode key={line.id} line={line} childrenOf={childrenOf} admin={admin} depth={0} />)}</ul>
        </div>
      ))}
    </section>
  )
}
