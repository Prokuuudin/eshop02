"use client"

import React, { useEffect, useMemo, useState } from 'react'
// Состояние для выбора вида отображения результатов поиска
// (перемещено ниже, как и должно быть)
import AdminGate from '@/components/admin/AdminGate'
import ProductCard from '@/components/ProductCard'
import { Button } from '@/components/ui/button'
import { IconTrash } from '@/components/ui/icon-trash'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PRODUCTS, type BadgeType, type CategoryType, type Product } from '@/data/products'
import { CATEGORY_CARDS } from '@/data/categories'
import { translations, type Language } from '@/data/translations'
import { useSiteContent } from '@/lib/use-site-content'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro } from '@/lib/utils'

type ArchiveItem = {
  id: string
  source: 'base' | 'custom'
  deletedAt: string
  product: Product
}

type DraftValues = {
  mode: 'form' | 'json'
  json: string
  titleKey: string
  title: string
  description: string
  brand: string
  category: CategoryType
  price: string
  oldPrice: string
  rating: string
  ratingCount: string
  reviewCount: string
  image: string
  metaTitle: string
  metaDescription: string
  ogImage: string
  ogAlt: string
  badges: BadgeType[]
  stock: string
  purpose: string
  relatedProductIdsCsv: string
  oftenBoughtTogetherCsv: string
  minOrderQuantitiesJson: string
  sku: string
  unitOfMeasure: string
  technicalSpecsJson: string
  certificatesCsv: string
  packagingSize: string
  compatibleEquipmentCsv: string
  bulkPricingTiersJson: string
}

type NewProductDraft = {
  id: string
  title: string
  titleEn: string
  titleLv: string
  brand: string
  category: CategoryType
  price: string
  oldPrice?: string
  currency?: string
  rating: string
  image: string
  stock: string
  purpose: string
  purposeEn: string
  purposeLv: string
  badges: BadgeType[]
}

type ProductPageTextDraft = {
  description: string
  feature1: string
  feature2: string
  feature3: string
  feature4: string
  specVolume: string
  specType: string
  specCountry: string
}

const CATEGORY_OPTIONS: CategoryType[] = ['hair', 'face', 'body', 'nails', 'equipment', 'new']

const BADGE_META: Record<BadgeType, { label: string; className: string }> = {
  sale: { label: 'sale', className: 'bg-red-600 text-white' },
  bestseller: { label: 'bestseller', className: 'bg-yellow-600 text-black' },
  new: { label: 'new', className: 'bg-green-600 text-white' }
}

const buildSearchDocument = (product: Product, description: string, localizedTitle?: string): string => {
  const technical = Object.entries(product.technicalSpecs ?? {})
    .map(([key, value]) => `${key} ${value}`)
    .join(' ')

  const resolvedTitle = localizedTitle ?? product.title

  return [
    product.id,
    product.sku,
    resolvedTitle,
    product.title,
    product.brand,
    product.category,
    product.purpose,
    description,
    technical
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const toEditableProduct = (product: Product): Omit<Product, 'id'> => {
  const { id: _id, ...editable } = product
  return editable
}

const formatProductJson = (product: Product): string => {
  return JSON.stringify(toEditableProduct(product), null, 2)
}

const toCsv = (values?: string[]): string => {
  return values?.join(', ') ?? ''
}

const fromCsv = (value: string): string[] => {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const toJsonString = (value: unknown, fallback: string): string => {
  if (!value) return fallback
  return JSON.stringify(value, null, 2)
}

const createDraftFromProduct = (product: Product): DraftValues => ({
  mode: 'form',
  json: formatProductJson(product),
  titleKey: product.titleKey ?? '',
  title: product.title,
  description: product.description ?? '',
  brand: product.brand,
  category: product.category,
  price: String(product.price),
  oldPrice: product.oldPrice !== undefined ? String(product.oldPrice) : '',
  rating: String(product.rating),
  ratingCount: product.ratingCount !== undefined ? String(product.ratingCount) : '',
  reviewCount: product.reviewCount !== undefined ? String(product.reviewCount) : '',
  image: product.image,
  metaTitle: product.metaTitle ?? '',
  metaDescription: product.metaDescription ?? '',
  ogImage: product.ogImage ?? '',
  ogAlt: product.ogAlt ?? '',
  badges: product.badges ?? [],
  stock: String(product.stock),
  purpose: product.purpose ?? '',
  relatedProductIdsCsv: toCsv(product.relatedProductIds),
  oftenBoughtTogetherCsv: toCsv(product.oftenBoughtTogether),
  minOrderQuantitiesJson: toJsonString(product.minOrderQuantities, '{}'),
  sku: product.sku ?? '',
  unitOfMeasure: product.unitOfMeasure ?? '',
  technicalSpecsJson: toJsonString(product.technicalSpecs, '{}'),
  certificatesCsv: toCsv(product.certificates),
  packagingSize: product.packagingSize !== undefined ? String(product.packagingSize) : '',
  compatibleEquipmentCsv: toCsv(product.compatibleEquipment),
  bulkPricingTiersJson: toJsonString(product.bulkPricingTiers, '[]')
})

const parseOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const num = Number(trimmed)
  if (!Number.isFinite(num)) throw new Error('invalid-number')
  return num
}

const parseRequiredNumber = (value: string): number => {
  const num = Number(value)
  if (!Number.isFinite(num)) throw new Error('invalid-number')
  return num
}

const parseJsonObject = (value: string): Record<string, string> | undefined => {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '{}') return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-object')
  return parsed as Record<string, string>
}

const parseJsonRecordNumber = (value: string): Record<string, number> | undefined => {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '{}') return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-object')
  return parsed as Record<string, number>
}

const parseJsonBulkTiers = (value: string): Array<{ quantity: number; pricePerUnit: number }> | undefined => {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '[]') return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!Array.isArray(parsed)) throw new Error('invalid-array')
  return parsed as Array<{ quantity: number; pricePerUnit: number }>
}

const buildChangesFromDraft = (draft: DraftValues): Omit<Product, 'id'> => {
  return {
    titleKey: draft.titleKey.trim() || undefined,
    title: draft.title.trim(),
    description: draft.description.trim() || undefined,
    brand: draft.brand.trim(),
    category: draft.category,
    price: parseRequiredNumber(draft.price),
    oldPrice: parseOptionalNumber(draft.oldPrice),
    rating: parseRequiredNumber(draft.rating),
    ratingCount: parseOptionalNumber(draft.ratingCount),
    reviewCount: parseOptionalNumber(draft.reviewCount),
    image: draft.image.trim(),
    metaTitle: draft.metaTitle.trim() || undefined,
    metaDescription: draft.metaDescription.trim() || undefined,
    ogImage: draft.ogImage.trim() || undefined,
    ogAlt: draft.ogAlt.trim() || undefined,
    badges: draft.badges,
    stock: parseRequiredNumber(draft.stock),
    purpose: draft.purpose.trim() || undefined,
    relatedProductIds: fromCsv(draft.relatedProductIdsCsv),
    oftenBoughtTogether: fromCsv(draft.oftenBoughtTogetherCsv),
    minOrderQuantities: parseJsonRecordNumber(draft.minOrderQuantitiesJson),
    sku: draft.sku.trim() || undefined,
    unitOfMeasure: draft.unitOfMeasure.trim() || undefined,
    technicalSpecs: parseJsonObject(draft.technicalSpecsJson),
    certificates: fromCsv(draft.certificatesCsv),
    packagingSize: parseOptionalNumber(draft.packagingSize),
    compatibleEquipment: fromCsv(draft.compatibleEquipmentCsv),
    bulkPricingTiers: parseJsonBulkTiers(draft.bulkPricingTiersJson)
  }
}

const toPreviewNumber = (value: string, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toPreviewOptionalNumber = (value: string, fallback: number | undefined): number | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toPreviewProduct = (base: Product, draft: DraftValues): Product => {
  let technicalSpecs = base.technicalSpecs
  let minOrderQuantities = base.minOrderQuantities
  let bulkPricingTiers = base.bulkPricingTiers

  try {
    technicalSpecs = parseJsonObject(draft.technicalSpecsJson)
  } catch {
    technicalSpecs = base.technicalSpecs
  }

  try {
    minOrderQuantities = parseJsonRecordNumber(draft.minOrderQuantitiesJson)
  } catch {
    minOrderQuantities = base.minOrderQuantities
  }

  try {
    bulkPricingTiers = parseJsonBulkTiers(draft.bulkPricingTiersJson)
  } catch {
    bulkPricingTiers = base.bulkPricingTiers
  }

  const oldPriceTrimmed = draft.oldPrice.trim()
  const parsedOldPrice = Number(oldPriceTrimmed)
  const oldPrice = !oldPriceTrimmed
    ? undefined
    : Number.isFinite(parsedOldPrice)
      ? parsedOldPrice
      : base.oldPrice

  return {
    ...base,
    titleKey: draft.titleKey.trim() || undefined,
    title: draft.title.trim() || base.title,
    description: draft.description.trim() || undefined,
    brand: draft.brand.trim() || base.brand,
    category: draft.category,
    price: toPreviewNumber(draft.price, base.price),
    oldPrice,
    rating: toPreviewNumber(draft.rating, base.rating),
    image: draft.image.trim() || base.image,
    badges: draft.badges,
    stock: toPreviewNumber(draft.stock, base.stock),
    purpose: draft.purpose.trim() || undefined,
    relatedProductIds: fromCsv(draft.relatedProductIdsCsv),
    oftenBoughtTogether: fromCsv(draft.oftenBoughtTogetherCsv),
    minOrderQuantities,
    sku: draft.sku.trim() || undefined,
    unitOfMeasure: draft.unitOfMeasure.trim() || undefined,
    technicalSpecs,
    certificates: fromCsv(draft.certificatesCsv),
    packagingSize: toPreviewOptionalNumber(draft.packagingSize, base.packagingSize),
    compatibleEquipment: fromCsv(draft.compatibleEquipmentCsv),
    bulkPricingTiers
  }
}

export default function AdminProductsPage() {
  // Состояние для выбора вида отображения результатов поиска: карточки или список
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const { t, language } = useTranslation()
  const { overrides, setText } = useSiteContent()
  const [baseProducts, setBaseProducts] = useState<Product[]>(PRODUCTS)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [contentSavingId, setContentSavingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [purgingArchiveId, setPurgingArchiveId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [contentLanguage, setContentLanguage] = useState<Language>('ru')
  const [drafts, setDrafts] = useState<Record<string, DraftValues>>({})
  const [productPageContentDrafts, setProductPageContentDrafts] = useState<Record<string, ProductPageTextDraft>>({})
  const [expandedProductIds, setExpandedProductIds] = useState<Record<string, boolean>>({})
  const [newProduct, setNewProduct] = useState<NewProductDraft>(DEFAULT_NEW_PRODUCT_DRAFT)
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en)
  const tl = (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => t(key, l(ru, en, lv), params)
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'
  const getLocalizedProductTitle = (product: Product): string => {
    if (language === 'en' && product.titleEn) return product.titleEn
    if (language === 'lv' && product.titleLv) return product.titleLv
    return t(product.titleKey ?? `products.${product.id}.title`, product.title)
  }

  const getProductPageContentDraft = (productId: string): ProductPageTextDraft => {
    const key = buildProductPageDraftKey(contentLanguage, productId)
    return productPageContentDrafts[key] ?? createProductPageTextDraft(contentLanguage, productId, overrides)
  }

  const updateProductPageContentDraft = (productId: string, patch: Partial<ProductPageTextDraft>) => {
    const key = buildProductPageDraftKey(contentLanguage, productId)
    setProductPageContentDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? createProductPageTextDraft(contentLanguage, productId, overrides)),
        ...patch
      }
    }))
  }

  const handleSaveProductPageContent = async (productId: string) => {
    const draft = getProductPageContentDraft(productId)
    const entries: Array<[string, string]> = [
      ['description', draft.description],
      ['feature1', draft.feature1],
      ['feature2', draft.feature2],
      ['feature3', draft.feature3],
      ['feature4', draft.feature4],
      ['spec.volume', draft.specVolume],
      ['spec.type', draft.specType],
      ['spec.country', draft.specCountry]
    ]

    setContentSavingId(productId)

    try {
      await Promise.all(entries.map(([suffix, value]) => setText(contentLanguage, getProductPageTextKey(productId, suffix), value)))
      setError('')
      setMessage(tl(
        'admin.productsPage.msg.contentSaved',
        'Контент страницы товара {id} обновлен ({lang})',
        'Product page content {id} updated ({lang})',
        'Produkta lapas saturs {id} atjauninats ({lang})',
        { id: productId, lang: contentLanguage.toUpperCase() }
      ))
    } catch {
      setMessage('')
      setError(tl(
        'admin.productsPage.msg.contentSaveError',
        'Не удалось сохранить контент страницы товара {id}',
        'Failed to save product page content {id}',
        'Neizdevas saglabat produkta lapas saturu {id}',
        { id: productId }
      ))
    } finally {
      setContentSavingId(null)
    }
  }

  const refreshArchive = async () => {
    try {
      const response = await fetch('/api/admin/products/archive', { cache: 'no-store' })
      if (!response.ok) throw new Error('archive-failed')

      const payload = (await response.json()) as { data?: { archive?: ArchiveItem[] } }
      setArchiveItems(payload.data?.archive ?? [])
    } catch {
      // Archive is optional for core product editing flow.
      setArchiveItems([])
    }
  }

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch('/api/admin/products', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(tl('admin.productsPage.msg.loadFailed', 'Не удалось загрузить товары', 'Failed to load products', 'Neizdevas ieladet produktus'))
        }

        const payload = (await response.json()) as { data?: { products?: Product[] } }
        const products = payload.data?.products
        if (products?.length) {
          setBaseProducts(products)
        }
      } catch {
        setError(tl('admin.productsPage.msg.loadApiFailed', 'Не удалось загрузить товары из API', 'Failed to load products from API', 'Neizdevas ieladet produktus no API'))
      } finally {
        setLoading(false)
      }
    }

    void loadProducts()
    void refreshArchive()
  }, [])

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return baseProducts

    return baseProducts.filter((product) => {
      const searchable = buildSearchDocument(product, product.description ?? '', getLocalizedProductTitle(product))
      return searchable.includes(normalizedQuery)
    })
  }, [baseProducts, searchQuery, t])

  const allBadgeOptions = useMemo<BadgeType[]>(() => {
    const set = new Set<BadgeType>(Object.keys(BADGE_META) as BadgeType[])

    baseProducts.forEach((product) => {
      product.badges?.forEach((badge) => set.add(badge))
    })

    return Array.from(set)
  }, [baseProducts])

  const updateDraft = (productId: string, nextDraft: Partial<DraftValues>, fallbackProduct: Product) => {
    setDrafts((prev) => {
      const current = prev[productId] ?? createDraftFromProduct(fallbackProduct)

      return {
        ...prev,
        [productId]: {
          ...current,
          ...nextDraft
        }
      }
    })
  }

  const toggleBadge = (product: Product, badge: BadgeType, checked: boolean) => {
    const current = getDraft(product)
    const nextBadges = checked
      ? Array.from(new Set([...current.badges, badge]))
      : current.badges.filter((item) => item !== badge)

    updateDraft(product.id, { badges: nextBadges }, product)
  }

  const getDraft = (product: Product): DraftValues => {
    return drafts[product.id] ?? createDraftFromProduct(product)
  }

  const toggleExpanded = (productId: string) => {
    setExpandedProductIds((prev) => ({
      ...prev,
      [productId]: !prev[productId]
    }))
  }

  const handleCreateProduct = async () => {
    const normalizedId = newProduct.id.trim()
    const normalizedTitle = newProduct.title.trim()
    const normalizedTitleEn = newProduct.titleEn.trim()
    const normalizedTitleLv = newProduct.titleLv.trim()
    const normalizedBrand = newProduct.brand.trim()
    const normalizedImage = newProduct.image.trim()

    if (!normalizedId || !normalizedTitle || !normalizedBrand || !normalizedImage) {
      setError(tl(
        'admin.productsPage.msg.createRequired',
        'Для добавления товара заполните ID, название, бренд и изображение',
        'To add a product, fill ID, title, brand and image',
        'Lai pievienotu produktu, aizpildiet ID, nosaukumu, zimolu un attelu'
      ))
      setMessage('')
      return
    }

    let payloadProduct: Product

    try {
      const parsedBadges = newProduct.badges

      payloadProduct = {
        id: normalizedId,
        title: normalizedTitle,
        titleEn: normalizedTitleEn || undefined,
        titleLv: normalizedTitleLv || undefined,
        brand: normalizedBrand,
        category: newProduct.category,
        price: parseRequiredNumber(newProduct.price),
        oldPrice: newProduct.oldPrice?.trim() ? parseRequiredNumber(newProduct.oldPrice) : undefined,
        rating: parseRequiredNumber(newProduct.rating),
        image: normalizedImage,
        stock: parseRequiredNumber(newProduct.stock),
        purpose: newProduct.purpose.trim() || undefined,
        purposeEn: newProduct.purposeEn.trim() || undefined,
        purposeLv: newProduct.purposeLv.trim() || undefined,
        badges: parsedBadges.length > 0 ? parsedBadges : undefined,
        currency: newProduct.currency?.trim() || undefined
      }
    } catch {
      setError(tl(
        'admin.productsPage.msg.createNumericError',
        'Проверьте числовые поля нового товара: price, rating, stock',
        'Check numeric fields of the new product: price, rating, stock',
        'Parbaudiet jaunā produkta skaitliskos laukus: price, rating, stock'
      ))
      setMessage('')
      return
    }

    setCreating(true)

    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product: payloadProduct })
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } }
        throw new Error(payload.error?.message ?? tl('admin.productsPage.msg.createFailed', 'Не удалось добавить товар', 'Failed to add product', 'Neizdevas pievienot produktu'))
      }

      const payload = (await response.json()) as { data?: { products?: Product[] } }
      const products = payload.data?.products
      if (products?.length) {
        setBaseProducts(products)
      }
      await refreshArchive()

      setNewProduct(DEFAULT_NEW_PRODUCT_DRAFT)
      setError('')
      setMessage(tl('admin.productsPage.msg.created', 'Товар {id} добавлен', 'Product {id} added', 'Produkts {id} pievienots', { id: normalizedId }))
    } catch (createError) {
      const errorMessage = createError instanceof Error ? createError.message : tl('admin.productsPage.msg.createFailed', 'Не удалось добавить товар', 'Failed to add product', 'Neizdevas pievienot produktu')
      setError(errorMessage)
      setMessage('')
    } finally {
      setCreating(false)
    }
  }

  const switchMode = (product: Product, mode: 'form' | 'json') => {
    const current = getDraft(product)

    if (mode === current.mode) return

    if (mode === 'json') {
      try {
        const changes = buildChangesFromDraft(current)
        updateDraft(product.id, { mode: 'json', json: JSON.stringify(changes, null, 2) }, product)
        setError('')
      } catch {
        setError(tl(
          'admin.productsPage.msg.buildJsonFailed',
          'Не удалось сформировать JSON из полей для товара {id}',
          'Failed to build JSON from fields for product {id}',
          'Neizdevas izveidot JSON no laukiem produktam {id}',
          { id: product.id }
        ))
      }
      return
    }

    try {
      const parsed = JSON.parse(current.json) as Omit<Product, 'id'>
      const merged: Product = {
        ...product,
        ...parsed,
        id: product.id
      }
      updateDraft(product.id, { ...createDraftFromProduct(merged), mode: 'form' }, product)
      setError('')
    } catch {
      setError(tl(
        'admin.productsPage.msg.switchInvalidJson',
        'Некорректный JSON. Исправьте его перед переключением в форму ({id})',
        'Invalid JSON. Fix it before switching to form mode ({id})',
        'Nekorekts JSON. Izlabojiet to pirms parslegsanas uz formas rezimu ({id})',
        { id: product.id }
      ))
    }
  }

  const handleSave = async (product: Product) => {
    const currentDraft = getDraft(product)
    let parsedChanges: Omit<Product, 'id'>

    try {
      if (currentDraft.mode === 'json') {
        const parsed = JSON.parse(currentDraft.json) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError(tl(
            'admin.productsPage.msg.invalidParamsJson',
            'Некорректный JSON параметров для товара {id}',
            'Invalid parameters JSON for product {id}',
            'Nekorekts parametru JSON produktam {id}',
            { id: product.id }
          ))
          setMessage('')
          return
        }
        parsedChanges = parsed as Omit<Product, 'id'>
      } else {
        parsedChanges = buildChangesFromDraft(currentDraft)
      }
    } catch {
      setError(tl(
        'admin.productsPage.msg.invalidParamsValues',
        'Некорректные данные параметров для товара {id}',
        'Invalid parameter values for product {id}',
        'Nekorektas parametru vertibas produktam {id}',
        { id: product.id }
      ))
      setMessage('')
      return
    }

    setSavingId(product.id)

    try {
      const response = await fetch('/api/admin/products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: product.id,
          changes: parsedChanges
        })
      })

      if (!response.ok) {
        throw new Error(tl('admin.productsPage.msg.saveFailed', 'Не удалось сохранить товар', 'Failed to save product', 'Neizdevas saglabat produktu'))
      }

      const payload = (await response.json()) as { data?: { products?: Product[] } }
      const products = payload.data?.products
      if (products?.length) {
        setBaseProducts(products)
      }

      const nextSavedProduct = products?.find((item) => item.id === product.id)
      if (nextSavedProduct) {
        setDrafts((prev) => ({
          ...prev,
          [product.id]: createDraftFromProduct(nextSavedProduct)
        }))
      }

      setError('')
      setMessage(tl('admin.productsPage.msg.saved', 'Товар {id} обновлен', 'Product {id} updated', 'Produkts {id} atjauninats', { id: product.id }))
    } catch {
      setError(tl('admin.productsPage.msg.saveByIdFailed', 'Не удалось сохранить товар {id}', 'Failed to save product {id}', 'Neizdevas saglabat produktu {id}', { id: product.id }))
      setMessage('')
    } finally {
      setSavingId(null)
    }
  }

  const handleReset = async (product: Product) => {
    setSavingId(product.id)

    try {
      const response = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: product.id })
      })

      if (!response.ok) {
        throw new Error(tl('admin.productsPage.msg.resetFailed', 'Не удалось сбросить изменения', 'Failed to reset changes', 'Neizdevas atiestatit izmainas'))
      }

      const payload = (await response.json()) as { data?: { products?: Product[] } }
      const products = payload.data?.products
      if (products?.length) {
        setBaseProducts(products)
      }

      setDrafts((prev) => {
        const nextDrafts = { ...prev }
        delete nextDrafts[product.id]
        return nextDrafts
      })

      setError('')
      setMessage(tl('admin.productsPage.msg.resetDone', 'Изменения для {id} сброшены', 'Changes for {id} were reset', 'Izmainas {id} tika atiestatitas', { id: product.id }))
    } catch {
      setError(tl('admin.productsPage.msg.resetByIdFailed', 'Не удалось сбросить изменения для {id}', 'Failed to reset changes for {id}', 'Neizdevas atiestatit izmainas produktam {id}', { id: product.id }))
      setMessage('')
    } finally {
      setSavingId(null)
    }
  }

  const handleDeleteProduct = async (product: Product) => {
    const confirmed = window.confirm(tl(
      'admin.productsPage.confirm.moveToTrash',
      'Переместить товар {id} в корзину? Его можно будет восстановить.',
      'Move product {id} to trash? It can be restored later.',
      'Parvietot produktu {id} uz grozu? To vares atjaunot velak.',
      { id: product.id }
    ))
    if (!confirmed) return

    setSavingId(product.id)

    try {
      const response = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: product.id, permanently: true })
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } }
        throw new Error(payload.error?.message ?? tl('admin.productsPage.msg.deleteByIdFailed', 'Не удалось удалить товар {id}', 'Failed to delete product {id}', 'Neizdevas dzest produktu {id}', { id: product.id }))
      }

      const payload = (await response.json()) as { data?: { products?: Product[] } }
      const products = payload.data?.products
      if (products?.length) {
        setBaseProducts(products)
      } else {
        setBaseProducts([])
      }
      await refreshArchive()

      setDrafts((prev) => {
        const next = { ...prev }
        delete next[product.id]
        return next
      })
      setExpandedProductIds((prev) => {
        const next = { ...prev }
        delete next[product.id]
        return next
      })

      setError('')
      setMessage(tl('admin.productsPage.msg.movedToTrash', 'Товар {id} перемещен в корзину', 'Product {id} moved to trash', 'Produkts {id} parvietots uz grozu', { id: product.id }))
    } catch (deleteError) {
      const errorMessage = deleteError instanceof Error ? deleteError.message : tl('admin.productsPage.msg.deleteByIdFailed', 'Не удалось удалить товар {id}', 'Failed to delete product {id}', 'Neizdevas dzest produktu {id}', { id: product.id })
      setError(errorMessage)
      setMessage('')
    } finally {
      setSavingId(null)
    }
  }

  const handlePurgeArchivedProduct = async (id: string) => {
    const confirmed = window.confirm(tl(
      'admin.productsPage.confirm.deleteForever',
      'Удалить товар {id} из корзины навсегда? Восстановление станет недоступно.',
      'Delete product {id} from trash permanently? Restore will be unavailable.',
      'Neatgriezeniski dzest produktu {id} no groza? Atjaunosana vairs nebus pieejama.',
      { id }
    ))
    if (!confirmed) return

    setPurgingArchiveId(id)

    try {
      const response = await fetch('/api/admin/products/archive', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } }
        throw new Error(payload.error?.message ?? tl('admin.productsPage.msg.deleteTrashByIdFailed', 'Не удалось удалить товар {id} из корзины', 'Failed to delete product {id} from trash', 'Neizdevas dzest produktu {id} no groza', { id }))
      }

      const payload = (await response.json()) as { data?: { archive?: ArchiveItem[] } }
      setArchiveItems(payload.data?.archive ?? [])
      setError('')
      setMessage(tl('admin.productsPage.msg.deletedForever', 'Товар {id} удален из корзины навсегда', 'Product {id} removed from trash permanently', 'Produkts {id} neatgriezeniski dzests no groza', { id }))
    } catch (purgeError) {
      const errorMessage = purgeError instanceof Error ? purgeError.message : tl('admin.productsPage.msg.deleteTrashByIdFailed', 'Не удалось удалить товар {id} из корзины', 'Failed to delete product {id} from trash', 'Neizdevas dzest produktu {id} no groza', { id })
      setError(errorMessage)
      setMessage('')
    } finally {
      setPurgingArchiveId(null)
    }
  }

  const handleRestoreProduct = async (id: string) => {
    setRestoringId(id)

    try {
      const response = await fetch('/api/admin/products/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      })

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } }
        throw new Error(payload.error?.message ?? tl('admin.productsPage.msg.restoreByIdFailed', 'Не удалось восстановить товар {id}', 'Failed to restore product {id}', 'Neizdevas atjaunot produktu {id}', { id }))
      }

      const payload = (await response.json()) as { data?: { products?: Product[]; archive?: ArchiveItem[] } }
      setBaseProducts(payload.data?.products ?? [])
      setArchiveItems(payload.data?.archive ?? [])
      setError('')
      setMessage(tl('admin.productsPage.msg.restored', 'Товар {id} восстановлен', 'Product {id} restored', 'Produkts {id} atjaunots', { id }))
    } catch (restoreError) {
      const errorMessage = restoreError instanceof Error ? restoreError.message : tl('admin.productsPage.msg.restoreByIdFailed', 'Не удалось восстановить товар {id}', 'Failed to restore product {id}', 'Neizdevas atjaunot produktu {id}', { id })
      setError(errorMessage)
      setMessage('')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <AdminGate>
      <main className="w-full space-y-3 text-gray-900 dark:text-gray-100">
        <div className="rounded-lg bg-white p-4 dark:bg-gray-900">
          <h1 className="text-2xl font-bold">{tl('admin.productsPage.title', 'Товары: управление', 'Products: management', 'Produkti: parvaldiba')}</h1>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            {tl(
              'admin.productsPage.subtitle',
              'Полный редактор карточки товара: визуальные поля по секциям + advanced JSON-режим.',
              'Full product card editor: visual fields by sections + advanced JSON mode.',
              'Pilns produkta kartites redaktors: vizualie lauki pa sekcijam + paplasinats JSON rezims.'
            )}
          </p>


          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={tl(
                  'admin.productsPage.searchPlaceholder',
                  'Поиск по ID, SKU, названию, бренду, категории, назначению и тех. характеристикам',
                  'Search by ID, SKU, title, brand, category, purpose, and technical specs',
                  'Meklet pec ID, SKU, nosaukuma, zimola, kategorijas, merka un tehniskajam specifikacijam'
                )}
                className="h-9 w-full md:w-[480px]"
              />
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded px-2 py-1 whitespace-nowrap border border-gray-200 dark:border-gray-700 font-medium">
                {tl('admin.productsPage.found', 'Найдено', 'Found', 'Atrasts')}: {filteredProducts.length}
              </span>
            </div>
            <div className="flex items-center gap-4 justify-end w-full md:w-auto">
              <span className="text-xs text-gray-600 dark:text-gray-300">{tl('admin.productsPage.viewMode', 'Выберите вид:', 'Select view:', 'Izveleties skatu:')}</span>
              {/* Импортируем иконки */}
              {/* @ts-ignore */}
              {(() => { try { require('@/components/ui/icon-view'); } catch {} })()}
              <div className="flex flex-row items-center gap-2">
                <Button
                  size="sm"
                  variant={viewMode === 'cards' ? 'default' : 'outline'}
                  onClick={() => setViewMode('cards')}
                  className="text-xs flex items-center gap-1"
                >
                  {React.createElement(require('@/components/ui/icon-view').IconGrid, { className: 'w-4 h-4' })}
                  {tl('admin.productsPage.viewCards', 'Карточки', 'Cards', 'Kartites')}
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  onClick={() => setViewMode('list')}
                  className="text-xs flex items-center gap-1"
                >
                  {React.createElement(require('@/components/ui/icon-view').IconList, { className: 'w-4 h-4' })}
                  {tl('admin.productsPage.viewList', 'Список', 'List', 'Saraksts')}
                </Button>
                <div className="ml-4">
                  <details className="inline-block align-middle rounded-md border border-gray-200 px-3 py-1 dark:border-gray-700">
                    <summary className="cursor-pointer select-none text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1">
                      <IconTrash className="w-4 h-4 mr-1 text-red-500" />
                      {tl('admin.productsPage.trashTitle', 'Корзина удаленных товаров', 'Deleted products trash', 'Dzesto produktu grozs')} ({archiveItems.length})
                    </summary>
                    <div className="mt-2 space-y-2 min-w-[260px]">
                      {archiveItems.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{tl('admin.productsPage.trashEmpty', 'Корзина пуста', 'Trash is empty', 'Grozs ir tukss')}</p>
                      ) : (
                        archiveItems.map((item) => (
                          <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 px-2 py-1 dark:border-gray-700">
                            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">{item.id}</span>
                            <span className="max-w-[120px] truncate text-xs text-gray-700 dark:text-gray-200">{getLocalizedProductTitle(item.product)}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{item.source === 'base' ? 'base' : 'custom'}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(item.deletedAt).toLocaleString(locale)}</span>
                            <div className="ml-auto flex gap-1">
                              <Button size="xs" variant="outline" disabled={restoringId === item.id} onClick={() => void handleRestoreProduct(item.id)}>
                                {restoringId === item.id
                                  ? tl('admin.productsPage.restoring', 'Восстановление...', 'Restoring...', 'Atjaunosana...')
                                  : tl('admin.productsPage.restore', 'Восстановить', 'Restore', 'Atjaunot')}
                              </Button>
                              <Button
                                size="xs"
                                variant="destructive"
                                disabled={purgingArchiveId === item.id}
                                onClick={() => void handlePurgeArchivedProduct(item.id)}
                              >
                                {purgingArchiveId === item.id
                                  ? tl('admin.productsPage.deleting', 'Удаляем...', 'Deleting...', 'Dzesam...')
                                  : tl('admin.productsPage.deleteForever', 'Удалить навсегда', 'Delete forever', 'Dzest neatgriezeniski')}
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
            <details className="mt-8 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-700 dark:bg-emerald-900/30">
              <summary className="cursor-pointer select-none text-sm font-semibold text-gray-700 dark:text-gray-200">{tl('admin.productsPage.addNew', 'Добавить новый товар', 'Add new product', 'Pievienot jaunu produktu')}</summary>
              <div className="mt-3 grid gap-6 md:grid-cols-[1fr_340px] items-start">
                <div className="grid gap-3 md:grid-cols-4">
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">ID</span>
                <Input className="h-9 text-sm" value={newProduct.id} onChange={(e) => setNewProduct((prev) => ({ ...prev, id: e.target.value }))} placeholder="ID" />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.name', 'Название', 'Title', 'Nosaukums')} RU</span>
                <Input className="h-9 text-sm" value={newProduct.title} onChange={(e) => setNewProduct((prev) => ({ ...prev, title: e.target.value }))} placeholder="Название RU" />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.name', 'Название', 'Title', 'Nosaukums')} EN</span>
                <Input className="h-9 text-sm" value={newProduct.titleEn} onChange={(e) => setNewProduct((prev) => ({ ...prev, titleEn: e.target.value }))} placeholder="Title EN" />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.name', 'Название', 'Title', 'Nosaukums')} LV</span>
                <Input className="h-9 text-sm" value={newProduct.titleLv} onChange={(e) => setNewProduct((prev) => ({ ...prev, titleLv: e.target.value }))} placeholder="Nosaukums LV" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.brand', 'Бренд', 'Brand', 'Zimols')}</span>
                <Input className="h-9 text-sm" value={newProduct.brand} onChange={(e) => setNewProduct((prev) => ({ ...prev, brand: e.target.value }))} placeholder="Бренд" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.category', 'Категория', 'Category', 'Kategorija')}</span>
                <select
                  value={newProduct.category}
                  onChange={(e) => setNewProduct((prev) => ({ ...prev, category: e.target.value as CategoryType }))}
                  className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                  placeholder="Категория"
                >
                  {CATEGORY_OPTIONS.map((option) => {
                    const card = CATEGORY_CARDS.find(c => c.id === option);
                    const label = card ? t(card.titleKey) : option;
                    return (
                      <option key={option} value={option}>{label}</option>
                    );
                  })}
                </select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.price', 'Цена', 'Price', 'Cena')}</span>
                <Input className="h-9 text-sm" type="number" value={newProduct.price} onChange={(e) => setNewProduct((prev) => ({ ...prev, price: e.target.value }))} placeholder="Цена (текущая)" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.oldPrice', 'Старая цена', 'Old price', 'Veca cena')}</span>
                <Input className="h-9 text-sm" type="number" value={newProduct.oldPrice ?? ''} onChange={(e) => setNewProduct((prev) => ({ ...prev, oldPrice: e.target.value }))} placeholder="Старая цена (если есть)" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.currency', 'Валюта', 'Currency', 'Valuta')}</span>
                <Input className="h-9 text-sm" value={newProduct.currency ?? ''} onChange={(e) => setNewProduct((prev) => ({ ...prev, currency: e.target.value }))} placeholder="RUB, EUR, USD..." />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.rating', 'Рейтинг', 'Rating', 'Vertējums')}</span>
                <Input className="h-9 text-sm" type="number" step="0.1" value={newProduct.rating} onChange={(e) => setNewProduct((prev) => ({ ...prev, rating: e.target.value }))} placeholder="Рейтинг" />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">stock</span>
                <Input className="h-9 text-sm" type="number" value={newProduct.stock} onChange={(e) => setNewProduct((prev) => ({ ...prev, stock: e.target.value }))} placeholder="Остаток" />
              </label>
              <div className="md:col-span-2 flex flex-row gap-4 items-end">
                <label className="text-xs flex-1">
                  <span className="mb-1 block text-gray-600 dark:text-gray-300">image URL/path</span>
                  <Input className="h-9 text-sm" value={newProduct.image} onChange={(e) => setNewProduct((prev) => ({ ...prev, image: e.target.value }))} placeholder="URL/path" />
                </label>
                <div className="text-xs flex-1 flex flex-col justify-end">
                  <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.badges', 'Бейджи', 'Badges', 'Bedzi')}</span>
                  <div className="flex flex-row gap-x-3 w-full justify-between">
                    {(Object.keys(BADGE_META) as BadgeType[]).map((badge) => (
                      <label key={badge} className="inline-flex cursor-pointer items-center gap-1 text-xs text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={newProduct.badges.includes(badge)}
                          onChange={e => setNewProduct(prev => ({
                            ...prev,
                            badges: e.target.checked
                              ? [...prev.badges, badge]
                              : prev.badges.filter(b => b !== badge)
                          }))}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <Badge className={BADGE_META[badge].className}>{BADGE_META[badge].label}</Badge>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Описание товара — отдельный ряд */}
              <div className="w-full flex flex-row gap-4 mb-2 mt-0 col-span-full">
                <label className="text-xs flex-1">
                  <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.description', 'Описание', 'Description', 'Apraksts')} RU</span>
                  <textarea className="h-16 min-h-0 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 resize-y" value={newProduct.description || ''} onChange={(e) => setNewProduct((prev) => ({ ...prev, description: e.target.value }))} placeholder="Описание RU" />
                </label>
                <label className="text-xs flex-1">
                  <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.description', 'Описание', 'Description', 'Apraksts')} EN</span>
                  <textarea className="h-16 min-h-0 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 resize-y" value={newProduct.descriptionEn || ''} onChange={(e) => setNewProduct((prev) => ({ ...prev, descriptionEn: e.target.value }))} placeholder="Description EN" />
                </label>
                <label className="text-xs flex-1">
                  <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.description', 'Описание', 'Description', 'Apraksts')} LV</span>
                  <textarea className="h-16 min-h-0 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 resize-y" value={newProduct.descriptionLv || ''} onChange={(e) => setNewProduct((prev) => ({ ...prev, descriptionLv: e.target.value }))} placeholder="Apraksts LV" />
                </label>
              </div>

              {/* Особенности товара (feature1-4) */}
              {[1,2,3,4].map(idx => (
                <div key={idx} className="w-full flex flex-row gap-4 mb-2 col-span-full">
                  <label className="text-xs flex-1">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl(`admin.productsPage.feature${idx}`, `Особенность ${idx}`, `Feature ${idx}`, `Ipašiba ${idx}`)} RU</span>
                    <Input className="h-9 text-sm" value={newProduct[`feature${idx}`] || ''} onChange={e => setNewProduct(prev => ({ ...prev, [`feature${idx}`]: e.target.value }))} placeholder={`Особенность ${idx} RU`} />
                  </label>
                  <label className="text-xs flex-1">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl(`admin.productsPage.feature${idx}`, `Особенность ${idx}`, `Feature ${idx}`, `Ipašiba ${idx}`)} EN</span>
                    <Input className="h-9 text-sm" value={newProduct[`feature${idx}En`] || ''} onChange={e => setNewProduct(prev => ({ ...prev, [`feature${idx}En`]: e.target.value }))} placeholder={`Feature ${idx} EN`} />
                  </label>
                  <label className="text-xs flex-1">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl(`admin.productsPage.feature${idx}`, `Особенность ${idx}`, `Feature ${idx}`, `Ipašiba ${idx}`)} LV</span>
                    <Input className="h-9 text-sm" value={newProduct[`feature${idx}Lv`] || ''} onChange={e => setNewProduct(prev => ({ ...prev, [`feature${idx}Lv`]: e.target.value }))} placeholder={`Ipašiba ${idx} LV`} />
                  </label>
                </div>
              ))}

              {/* Характеристики товара */}
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.spec.volume', 'Объем', 'Volume', 'Apjoms')}</span>
                <Input className="h-9 text-sm" value={newProduct.specVolume || ''} onChange={(e) => setNewProduct((prev) => ({ ...prev, specVolume: e.target.value }))} placeholder="Объем/Volume/Apjoms" />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.spec.type', 'Тип', 'Type', 'Tips')}</span>
                <Input className="h-9 text-sm" value={newProduct.specType || ''} onChange={(e) => setNewProduct((prev) => ({ ...prev, specType: e.target.value }))} placeholder="Тип/Type/Tips" />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{tl('admin.productsPage.spec.country', 'Страна', 'Country', 'Valsts')}</span>
                <Input className="h-9 text-sm" value={newProduct.specCountry || ''} onChange={(e) => setNewProduct((prev) => ({ ...prev, specCountry: e.target.value }))} placeholder="Страна/Country/Valsts" />
              </label>
              <div className="flex items-end justify-end md:col-start-4 pt-5">
                <Button className="h-12 text-base font-semibold px-8" size="lg" onClick={() => void handleCreateProduct()} disabled={creating}>
                  {creating
                    ? tl('admin.productsPage.adding', 'Добавляем...', 'Adding...', 'Pievienojam...')
                    : tl('admin.productsPage.add', 'Добавить товар', 'Add product', 'Pievienot produktu')}
                </Button>
              </div>
                </div>
                <div className="mt-0">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    {tl('admin.productsPage.preview', 'Превью', 'Preview', 'Priekskats')}
                  </span>
                  <div className="overflow-hidden rounded-md bg-gray-50 p-2 dark:bg-gray-800">
                    <ProductCard
                      product={{
                        id: newProduct.id || 'preview',
                        title: newProduct.title,
                        titleEn: newProduct.titleEn || undefined,
                        titleLv: newProduct.titleLv || undefined,
                        brand: newProduct.brand,
                        category: newProduct.category,
                        price: Number(newProduct.price) || 0,
                        oldPrice: undefined,
                        rating: Number(newProduct.rating) || 0,
                        image: newProduct.image,
                        stock: Number(newProduct.stock) || 0,
                        badges: newProduct.badges,
                        purpose: newProduct.purpose || undefined,
                        purposeEn: newProduct.purposeEn || undefined,
                        purposeLv: newProduct.purposeLv || undefined,
                      }}
                    />
                  </div>
                </div>
              </div>
        </details>
        </div>


          {message && (
            <p className="mt-8 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
              {message}
            </p>
          )}
          {error && (
            <p className="mt-8 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
              {error}
            </p>
          )}
        {/* конец блока с сообщениями и ошибками */}
        {viewMode === 'cards' ? (
          <div className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold mb-2">{tl('admin.productsPage.cardsTitle', 'Карточки товара', 'Product cards', 'Produktu kartites')}</h2>
            {loading && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {tl('admin.productsPage.loading', 'Загрузка товаров...', 'Loading products...', 'Ieladejam produktus...')}
              </div>
            )}
            {filteredProducts.map((product) => {
              const draft = getDraft(product)
              const contentDraft = getProductPageContentDraft(product.id)
              const isSaving = savingId === product.id
              const isContentSaving = contentSavingId === product.id
              const isExpanded = expandedProductIds[product.id] ?? false
              const previewProduct = toPreviewProduct(product, draft)
              return (
                <article key={product.id} className="rounded-lg bg-white p-4 dark:bg-gray-900">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap gap-2 items-center mb-2">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">ID: {product.id}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{getLocalizedProductTitle(product)}</span>
                        {allBadgeOptions.map((badge) => (
                          <label key={badge} className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-gray-200">
                            <input
                              type="checkbox"
                              checked={draft.badges.includes(badge)}
                              onChange={e => toggleBadge(product, badge, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <Badge className={BADGE_META[badge].className}>{BADGE_META[badge].label}</Badge>
                          </label>
                        ))}
                        <Button size="xs" variant="ghost" className="ml-auto" onClick={() => toggleExpanded(product.id)}>
                          {isExpanded ? '▲' : '▼'}
                        </Button>
                      </div>
                      {draft.mode === 'form' ? (
                        <div className="grid gap-2 md:grid-cols-3">
                          <label className="text-xs">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.name', 'Название', 'Title', 'Nosaukums')} RU</span>
                            <Input className="h-8 text-xs" value={draft.title} onChange={e => updateDraft(product.id, { title: e.target.value }, product)} />
                          </label>
                          <label className="text-xs">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">EN</span>
                            <Input className="h-8 text-xs" value={product.titleEn ?? ''} disabled />
                          </label>
                          <label className="text-xs">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">LV</span>
                            <Input className="h-8 text-xs" value={product.titleLv ?? ''} disabled />
                          </label>
                          <label className="text-xs">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.brand', 'Бренд', 'Brand', 'Zimols')}</span>
                            <Input className="h-8 text-xs" value={draft.brand} onChange={e => updateDraft(product.id, { brand: e.target.value }, product)} />
                          </label>
                          <label className="text-xs">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.price', 'Цена', 'Price', 'Cena')}</span>
                            <Input className="h-8 text-xs" type="number" value={draft.price} onChange={e => updateDraft(product.id, { price: e.target.value }, product)} />
                          </label>
                          <label className="text-xs">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.oldPrice', 'Старая цена', 'Old price', 'Veca cena')}</span>
                            <Input className="h-8 text-xs" type="number" value={draft.oldPrice} onChange={e => updateDraft(product.id, { oldPrice: e.target.value }, product)} />
                          </label>
                        </div>
                      ) : (
                        <textarea
                          className="w-full h-32 text-xs font-mono border rounded p-2 mt-2"
                          value={draft.json}
                          onChange={e => updateDraft(product.id, { json: e.target.value }, product)}
                        />
                      )}
                      {isExpanded && (
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <label className="text-xs md:col-span-3">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.description', 'Описание', 'Description', 'Apraksts')} RU</span>
                            <textarea className="h-12 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800" value={draft.description || ''} onChange={e => updateDraft(product.id, { description: e.target.value }, product)} placeholder="Описание RU" />
                          </label>
                          <label className="text-xs md:col-span-3">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.description', 'Описание', 'Description', 'Apraksts')} EN</span>
                            <textarea className="h-12 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800" value={draft.descriptionEn || ''} onChange={e => updateDraft(product.id, { descriptionEn: e.target.value }, product)} placeholder="Description EN" />
                          </label>
                          <label className="text-xs md:col-span-3">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.description', 'Описание', 'Description', 'Apraksts')} LV</span>
                            <textarea className="h-12 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800" value={draft.descriptionLv || ''} onChange={e => updateDraft(product.id, { descriptionLv: e.target.value }, product)} placeholder="Apraksts LV" />
                          </label>

                          {/* Особенности товара (feature1-4) */}
                          {[1,2,3,4].map(idx => (
                            <React.Fragment key={idx}>
                              <label className="text-xs md:col-span-3">
                                <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl(`admin.productsPage.feature${idx}`, `Особенность ${idx}`, `Feature ${idx}`, `Ipašiba ${idx}`)} RU</span>
                                <Input className="h-8 text-xs" value={draft[`feature${idx}`] || ''} onChange={e => updateDraft(product.id, { [`feature${idx}`]: e.target.value }, product)} placeholder={`Особенность ${idx} RU`} />
                              </label>
                              <label className="text-xs md:col-span-3">
                                <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl(`admin.productsPage.feature${idx}`, `Особенность ${idx}`, `Feature ${idx}`, `Ipašiba ${idx}`)} EN</span>
                                <Input className="h-8 text-xs" value={draft[`feature${idx}En`] || ''} onChange={e => updateDraft(product.id, { [`feature${idx}En`]: e.target.value }, product)} placeholder={`Feature ${idx} EN`} />
                              </label>
                              <label className="text-xs md:col-span-3">
                                <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl(`admin.productsPage.feature${idx}`, `Особенность ${idx}`, `Feature ${idx}`, `Ipašiba ${idx}`)} LV</span>
                                <Input className="h-8 text-xs" value={draft[`feature${idx}Lv`] || ''} onChange={e => updateDraft(product.id, { [`feature${idx}Lv`]: e.target.value }, product)} placeholder={`Ipašiba ${idx} LV`} />
                              </label>
                            </React.Fragment>
                          ))}

                          {/* Характеристики товара */}
                          <label className="text-xs md:col-span-1">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.spec.volume', 'Объем', 'Volume', 'Apjoms')}</span>
                            <Input className="h-8 text-xs" value={draft.specVolume || ''} onChange={e => updateDraft(product.id, { specVolume: e.target.value }, product)} placeholder="Объем/Volume/Apjoms" />
                          </label>
                          <label className="text-xs md:col-span-1">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.spec.type', 'Тип', 'Type', 'Tips')}</span>
                            <Input className="h-8 text-xs" value={draft.specType || ''} onChange={e => updateDraft(product.id, { specType: e.target.value }, product)} placeholder="Тип/Type/Tips" />
                          </label>
                          <label className="text-xs md:col-span-1">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.spec.country', 'Страна', 'Country', 'Valsts')}</span>
                            <Input className="h-8 text-xs" value={draft.specCountry || ''} onChange={e => updateDraft(product.id, { specCountry: e.target.value }, product)} placeholder="Страна/Country/Valsts" />
                          </label>

                          <label className="text-xs md:col-span-3 mt-2">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.purpose', 'Назначение', 'Purpose', 'Merkis')}</span>
                            <Input className="h-8 text-xs" value={draft.purpose} onChange={e => updateDraft(product.id, { purpose: e.target.value }, product)} />
                          </label>
                          <label className="text-xs md:col-span-3 mt-2">
                            <span className="block mb-1 text-gray-600 dark:text-gray-300">{tl('admin.productsPage.image', 'Изображение', 'Image', 'Attels')}</span>
                            <Input className="h-8 text-xs" value={draft.image} onChange={e => updateDraft(product.id, { image: e.target.value }, product)} />
                          </label>
                        </div>
                      )}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => handleSave(product)} disabled={isSaving}>
                          {isSaving ? tl('admin.productsPage.saving', 'Сохраняем...', 'Saving...', 'Saglabajam...') : tl('admin.productsPage.save', 'Сохранить', 'Save', 'Saglabat')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleReset(product)} disabled={isSaving}>
                          {tl('admin.productsPage.reset', 'Сбросить', 'Reset', 'Atstatit')}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteProduct(product)}>
                          {tl('admin.productsPage.delete', 'Удалить', 'Delete', 'Dzest')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => switchMode(product, draft.mode === 'form' ? 'json' : 'form')}>
                          {draft.mode === 'form' ? 'JSON' : 'Form'}
                        </Button>
                      </div>
                    </div>
                    <div className="w-[220px]">
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                        {tl('admin.productsPage.preview', 'Превью', 'Preview', 'Priekskats')}
                      </span>
                      <div className="overflow-hidden rounded-md bg-gray-50 p-2 dark:bg-gray-800">
                        <ProductCard product={previewProduct} />
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
            {filteredProducts.length === 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {tl('admin.productsPage.emptySearch', 'По вашему запросу товары не найдены.', 'No products found for your query.', 'Pec jusu pieprasijuma produkti nav atrasti.')}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <h2 className="text-xl font-semibold mb-2">{tl('admin.productsPage.listTitle', 'Список товаров', 'Product list', 'Produktu saraksts')}</h2>
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">{tl('admin.productsPage.name', 'Название', 'Title', 'Nosaukums')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">ID</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">{tl('admin.productsPage.category', 'Категория', 'Category', 'Kategorija')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">{tl('admin.productsPage.purpose', 'Назначение', 'Purpose', 'Merkis')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">{tl('admin.productsPage.image', 'Изображение', 'Image', 'Attels')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200"></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-300">
                      {tl('admin.productsPage.emptySearch', 'По вашему запросу товары не найдены.', 'No products found for your query.', 'Pec jusu pieprasijuma produkti nav atrasti.')}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-[240px] truncate">{getLocalizedProductTitle(product)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{product.id}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{product.category}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{product.purpose ?? tl('admin.productsPage.noPurpose', 'без назначения', 'no purpose', 'bez merka')}</td>
                      <td className="px-3 py-2">
                        {product.image && (
                          <img src={product.image} alt={getLocalizedProductTitle(product)} className="w-12 h-12 object-contain rounded border border-gray-200 dark:border-gray-700 bg-white" />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <a href={`/admin/products/${product.id}`} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 transition">
                          {tl('admin.productsPage.edit', 'Редактировать', 'Edit', 'Rediget')}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminGate>
  )
}

const DEFAULT_NEW_PRODUCT_DRAFT: NewProductDraft = {
  id: '',
  title: '',
  titleEn: '',
  titleLv: '',
  brand: '',
  category: 'face',
  price: '0',
  oldPrice: '',
  currency: '',
  rating: '4.5',
  image: '/products/new-item.jpg',
  stock: '0',
  purpose: '',
  purposeEn: '',
  purposeLv: '',
  badges: []
}

const PRODUCT_PAGE_CONTENT_LANGUAGES: Language[] = ['ru', 'en', 'lv']

const getProductPageTextKey = (productId: string, suffix: string): string => `products.${productId}.${suffix}`

const getResolvedProductPageText = (
  language: Language,
  productId: string,
  suffix: string,
  overrides: ReturnType<typeof useSiteContent>['overrides']
): string => {
  const key = getProductPageTextKey(productId, suffix)
  return overrides.text[language]?.[key] ?? translations[language][key] ?? ''
}

const createProductPageTextDraft = (
  language: Language,
  productId: string,
  overrides: ReturnType<typeof useSiteContent>['overrides']
): ProductPageTextDraft => ({
  description: getResolvedProductPageText(language, productId, 'description', overrides),
  feature1: getResolvedProductPageText(language, productId, 'feature1', overrides),
  feature2: getResolvedProductPageText(language, productId, 'feature2', overrides),
  feature3: getResolvedProductPageText(language, productId, 'feature3', overrides),
  feature4: getResolvedProductPageText(language, productId, 'feature4', overrides),
  specVolume: getResolvedProductPageText(language, productId, 'spec.volume', overrides),
  specType: getResolvedProductPageText(language, productId, 'spec.type', overrides),
  specCountry: getResolvedProductPageText(language, productId, 'spec.country', overrides)
})

const buildProductPageDraftKey = (language: Language, productId: string): string => `${language}:${productId}`