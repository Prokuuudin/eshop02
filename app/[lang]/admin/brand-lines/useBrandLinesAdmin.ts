'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAdminLocale } from '@/lib/use-admin-locale'

export type LocalizedNames = { default?: string; ru?: string; lv?: string; en?: string }
export type AdminBrandLine = {
  id: string; key: string; brandKey: string; parentId: string | null; slug: string; names: LocalizedNames
  kind: 'line' | 'series' | 'subbrand'; status: 'active' | 'archived'; origin: 'source_sync' | 'admin'
  adminLocked: boolean; depth: number; directProducts: number; excludedProducts: number; sourceCategoryIds: string[]
  updatedAt?: string
}
export type AdminBrand = { key: string; name: string }
export type LineProduct = {
  productId: string; origin: string; status: string; isPresentInSource: boolean; missingSnapshotCount: number; sourceCategoryId: string | null
  product: { id: string; sku: string | null; title: string; titleLv: string | null; titleEn: string | null; brand: string; isActive: boolean; isDeleted: boolean }
}
export type LineDetail = {
  line: AdminBrandLine
  sources: Array<{ sourceCategoryId: string; origin: string; status: string; names: LocalizedNames; isPresent: boolean }>
  products: LineProduct[]
}
export type ReviewItem = {
  id: string; reason: string; subjectKey: string; status: string; details: Record<string, unknown>
  occurrences: number; firstSeenAt: string; lastSeenAt: string; resolvedBy: string | null; categoryNames: LocalizedNames | null
}

const ERRORS: Record<string, [string, string, string]> = {
  brand_not_found: ['Бренд не найден', 'Brand not found', 'Zīmols nav atrasts'],
  parent_not_found: ['Родительская линейка не найдена', 'Parent line not found', 'Vecāklīnija nav atrasta'],
  cross_brand_parent: ['Родитель принадлежит другому бренду', 'The parent belongs to another brand', 'Vecāklīnija pieder citam zīmolam'],
  line_cycle: ['Нельзя сделать линейку потомком самой себя', 'A line cannot become its own descendant', 'Līnija nevar kļūt par savu pēcteci'],
  line_too_deep: ['Превышена допустимая глубина вложенности', 'Nesting depth limit exceeded', 'Pārsniegts ligzdošanas dziļums'],
  move_changes_subtree_depth: ['Линейку с дочерними нельзя перенести на другой уровень', 'A line with children cannot move to another level', 'Līniju ar apakšlīnijām nevar pārvietot uz citu līmeni'],
  duplicate_through_hierarchy: ['Товар уже связан с родительской или дочерней линейкой', 'The product is already linked to a parent or child line', 'Produkts jau piesaistīts vecāk- vai apakšlīnijai'],
  line_slug_exists: ['Такой slug уже есть на этом уровне', 'This slug already exists at this level', 'Šāds slug šajā līmenī jau ir'],
  line_key_exists: ['Линейка с таким ключом уже есть', 'A line with this key already exists', 'Līnija ar šādu atslēgu jau ir'],
  line_has_active_children: ['Сначала архивируйте дочерние линейки', 'Archive the child lines first', 'Vispirms arhivējiet apakšlīnijas'],
  product_not_found: ['Товар не найден', 'Product not found', 'Produkts nav atrasts'],
  product_ambiguous: ['Найдено несколько товаров, укажите ID', 'Several products match, use the ID', 'Atrasti vairāki produkti, norādiet ID'],
  product_deleted: ['Товар удалён', 'The product is deleted', 'Produkts ir dzēsts'],
  product_brand_mismatch: ['Бренд товара не совпадает с брендом линейки', 'The product brand differs from the line brand', 'Produkta zīmols neatbilst līnijas zīmolam'],
  category_brand_mismatch: ['Категория источника относится к другому бренду', 'The source category belongs to another brand', 'Avota kategorija pieder citam zīmolam'],
  mapping_exists: ['Для категории уже есть сопоставление', 'The category is already mapped', 'Kategorijai jau ir piesaiste'],
  review_closed: ['Пункт уже закрыт', 'The item is already closed', 'Punkts jau ir slēgts'],
  action_not_supported: ['Действие недоступно для этого пункта', 'Action not available for this item', 'Darbība šim punktam nav pieejama'],
  invalid_request: ['Проверьте заполнение полей', 'Check the fields', 'Pārbaudiet laukus'],
  forbidden: ['Недостаточно прав', 'Insufficient permissions', 'Nepietiek tiesību'],
}

type Actions = {
  create: (input: { brandKey: string; parentId: string | null; slug: string; kind: string; names: LocalizedNames }) => Promise<void>
  update: (id: string, input: Record<string, unknown>) => Promise<void>
  membership: (id: string, product: string, action: 'include' | 'exclude') => Promise<void>
  review: (id: string, input: Record<string, unknown>) => Promise<void>
  setReviewStatus: (status: 'open' | 'resolved' | 'dismissed') => void
}

export type BrandLinesAdmin = {
  l: (ru: string, en: string, lv: string) => string
  language: 'ru' | 'en' | 'lv'
  name: (names: LocalizedNames | null | undefined) => string
  brands: AdminBrand[]
  lines: AdminBrandLine[]
  openReviews: number
  selectedId: string | null
  select: (id: string | null) => void
  detail: LineDetail | null
  reviews: ReviewItem[]
  reviewStatus: 'open' | 'resolved' | 'dismissed'
  loading: boolean
  busy: boolean
  message: { kind: 'ok' | 'error'; text: string } | null
  actions: Actions
}

export function useBrandLinesAdmin(): BrandLinesAdmin {
  const { l, language } = useAdminLocale()
  const [brands, setBrands] = useState<AdminBrand[]>([])
  const [lines, setLines] = useState<AdminBrandLine[]>([])
  const [openReviews, setOpenReviews] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<LineDetail | null>(null)
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [reviewStatus, setReviewStatus] = useState<'open' | 'resolved' | 'dismissed'>('open')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const name = useCallback((names: LocalizedNames | null | undefined): string =>
    (names && (names[language] || names.default || names.lv || names.ru || names.en)) || '—', [language])
  const errorText = useCallback((code: string): string => {
    const entry = ERRORS[code]
    return entry ? l(entry[0], entry[1], entry[2]) : l(`Ошибка: ${code}`, `Error: ${code}`, `Kļūda: ${code}`)
  }, [l])

  const call = useCallback(async (url: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
    const body = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(body.error ?? `http_${response.status}`)
    return body
  }, [])

  const loadTree = useCallback(async () => {
    const data = await call('/api/admin/brand-lines') as { brands: AdminBrand[]; lines: AdminBrandLine[]; openReviews: number }
    setBrands(data.brands)
    setLines(data.lines)
    setOpenReviews(data.openReviews)
  }, [call])
  const loadDetail = useCallback(async (id: string | null) => {
    setDetail(id ? await call(`/api/admin/brand-lines/${encodeURIComponent(id)}`) as LineDetail : null)
  }, [call])
  const loadReviews = useCallback(async (status = reviewStatus) => {
    const data = await call(`/api/admin/brand-lines/review?status=${status}`) as { items: ReviewItem[] }
    setReviews(data.items)
  }, [call, reviewStatus])

  useEffect(() => {
    let active = true
    // The state updates happen only after the asynchronous requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadTree(), loadReviews()])
      .catch(error => { if (active) setMessage({ kind: 'error', text: errorText((error as Error).message) }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = useCallback(async (action: () => Promise<void>, success: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      setMessage({ kind: 'ok', text: success })
    } catch (error) {
      setMessage({ kind: 'error', text: errorText((error as Error).message) })
    } finally {
      setBusy(false)
    }
  }, [errorText])

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    loadDetail(id).catch(error => setMessage({ kind: 'error', text: errorText((error as Error).message) }))
  }, [errorText, loadDetail])

  const actions = useMemo<Actions>(() => ({
    create: (input: { brandKey: string; parentId: string | null; slug: string; kind: string; names: LocalizedNames }) => run(async () => {
      const created = await call('/api/admin/brand-lines', { method: 'POST', body: JSON.stringify(input) }) as { id: string }
      await loadTree()
      setSelectedId(created.id)
      await loadDetail(created.id)
    }, l('Линейка создана', 'Line created', 'Līnija izveidota')),
    update: (id: string, input: Record<string, unknown>) => run(async () => {
      await call(`/api/admin/brand-lines/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
      await Promise.all([loadTree(), loadDetail(id)])
    }, l('Изменения сохранены', 'Changes saved', 'Izmaiņas saglabātas')),
    membership: (id: string, product: string, action: 'include' | 'exclude') => run(async () => {
      await call(`/api/admin/brand-lines/${encodeURIComponent(id)}/products`, { method: 'POST', body: JSON.stringify({ product, action }) })
      await Promise.all([loadTree(), loadDetail(id)])
    }, action === 'include' ? l('Товар добавлен', 'Product added', 'Produkts pievienots') : l('Товар исключён', 'Product excluded', 'Produkts izslēgts')),
    review: (id: string, input: Record<string, unknown>) => run(async () => {
      await call(`/api/admin/brand-lines/review/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(input) })
      await Promise.all([loadReviews(), loadTree()])
    }, l('Решение сохранено', 'Decision saved', 'Lēmums saglabāts')),
    setReviewStatus: (status: 'open' | 'resolved' | 'dismissed') => {
      setReviewStatus(status)
      loadReviews(status).catch(error => setMessage({ kind: 'error', text: errorText((error as Error).message) }))
    },
  }), [call, errorText, l, loadDetail, loadReviews, loadTree, run])

  return { l, language, name, brands, lines, openReviews, selectedId, select, detail, reviews, reviewStatus, loading, busy, message, actions }
}

