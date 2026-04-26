import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PRODUCTS, type Product } from '@/data/products'

export type ProductOverride = Partial<Omit<Product, 'id'>>
export type ArchivedProductRecord = {
  id: string
  product: Product
  source: 'base' | 'custom'
  deletedAt: string
}

const OVERRIDES_FILE_PATH = path.join(process.cwd(), 'data', 'product-overrides.json')
const CUSTOM_PRODUCTS_FILE_PATH = path.join(process.cwd(), 'data', 'custom-products.json')
const DELETED_PRODUCTS_FILE_PATH = path.join(process.cwd(), 'data', 'deleted-products.json')
const DELETED_PRODUCTS_ARCHIVE_FILE_PATH = path.join(process.cwd(), 'data', 'deleted-products-archive.json')

const readOverridesFile = async (): Promise<Record<string, ProductOverride>> => {
  try {
    const raw = await fs.readFile(OVERRIDES_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, ProductOverride>
    return parsed ?? {}
  } catch {
    return {}
  }
}

const writeOverridesFile = async (overrides: Record<string, ProductOverride>): Promise<void> => {
  await fs.writeFile(OVERRIDES_FILE_PATH, JSON.stringify(overrides, null, 2), 'utf-8')
}

const readCustomProductsFile = async (): Promise<Product[]> => {
  try {
    const raw = await fs.readFile(CUSTOM_PRODUCTS_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Product[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeCustomProductsFile = async (products: Product[]): Promise<void> => {
  await fs.writeFile(CUSTOM_PRODUCTS_FILE_PATH, JSON.stringify(products, null, 2), 'utf-8')
}

const readDeletedProductIdsFile = async (): Promise<string[]> => {
  try {
    const raw = await fs.readFile(DELETED_PRODUCTS_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
  } catch {
    return []
  }
}

const writeDeletedProductIdsFile = async (ids: string[]): Promise<void> => {
  await fs.writeFile(DELETED_PRODUCTS_FILE_PATH, JSON.stringify(ids, null, 2), 'utf-8')
}

const readDeletedProductsArchiveFile = async (): Promise<ArchivedProductRecord[]> => {
  try {
    const raw = await fs.readFile(DELETED_PRODUCTS_ARCHIVE_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as ArchivedProductRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeDeletedProductsArchiveFile = async (records: ArchivedProductRecord[]): Promise<void> => {
  await fs.writeFile(DELETED_PRODUCTS_ARCHIVE_FILE_PATH, JSON.stringify(records, null, 2), 'utf-8')
}

export const getProductOverrides = async (): Promise<Record<string, ProductOverride>> => {
  return readOverridesFile()
}

export const getCustomProducts = async (): Promise<Product[]> => {
  return readCustomProductsFile()
}

export const getDeletedProductIds = async (): Promise<Set<string>> => {
  const ids = await readDeletedProductIdsFile()
  return new Set(ids)
}

export const getDeletedProductsArchive = async (): Promise<ArchivedProductRecord[]> => {
  return readDeletedProductsArchiveFile()
}

export const getMergedProducts = async (): Promise<Product[]> => {
  const overrides = await getProductOverrides()
  const customProducts = await getCustomProducts()
  const deletedProductIds = await getDeletedProductIds()
  const baseProducts = [...PRODUCTS, ...customProducts].filter((product) => !deletedProductIds.has(product.id))

  return baseProducts.map((product) => {
    const override = overrides[product.id]
    if (!override) return product

    return {
      ...product,
      ...override,
      id: product.id
    }
  })
}

const normalizeProductPatch = (patch: Partial<Omit<Product, 'id'>>): Partial<Omit<Product, 'id'>> => {
  const normalized = { ...patch }

  if (typeof normalized.price === 'number' && !Number.isFinite(normalized.price)) delete normalized.price
  if (typeof normalized.oldPrice === 'number' && !Number.isFinite(normalized.oldPrice)) delete normalized.oldPrice
  if (typeof normalized.rating === 'number' && !Number.isFinite(normalized.rating)) delete normalized.rating
  if (typeof normalized.ratingCount === 'number' && !Number.isFinite(normalized.ratingCount)) delete normalized.ratingCount
  if (typeof normalized.reviewCount === 'number' && !Number.isFinite(normalized.reviewCount)) delete normalized.reviewCount
  if (typeof normalized.stock === 'number' && !Number.isFinite(normalized.stock)) delete normalized.stock
  if (typeof normalized.packagingSize === 'number' && !Number.isFinite(normalized.packagingSize)) delete normalized.packagingSize

  return normalized
}

const isSameOverrideAsBase = (base: Product, patch: Partial<Omit<Product, 'id'>>): boolean => {
  const next = {
    ...base,
    ...patch,
    id: base.id
  }

  // Compare only editable fields; id is immutable and ignored.
  return JSON.stringify({ ...next, id: undefined }) === JSON.stringify({ ...base, id: undefined })
}

const buildOverrideFromSnapshot = (base: Product, snapshot: Product): ProductOverride => {
  const nextOverride: ProductOverride = {}

  const snapshotWithoutId = { ...snapshot, id: undefined } as Record<string, unknown>
  const baseWithoutId = { ...base, id: undefined } as Record<string, unknown>

  Object.keys(snapshotWithoutId).forEach((key) => {
    const snapshotValue = snapshotWithoutId[key]
    const baseValue = baseWithoutId[key]
    if (JSON.stringify(snapshotValue) !== JSON.stringify(baseValue)) {
      ;(nextOverride as Record<string, unknown>)[key] = snapshotValue
    }
  })

  return nextOverride
}

export const upsertProductOverride = async (
  productId: string,
  nextValues: Partial<Omit<Product, 'id'>>
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const mergedProducts = await getMergedProducts()
  const baseProduct = mergedProducts.find((product) => product.id === productId)
  if (!baseProduct) {
    return { success: false, error: 'Товар не найден' }
  }

  const normalizedPatch = normalizeProductPatch(nextValues)
  const overrides = await getProductOverrides()
  if (isSameOverrideAsBase(baseProduct, normalizedPatch)) {
    delete overrides[productId]
  } else {
    overrides[productId] = normalizedPatch
  }

  await writeOverridesFile(overrides)

  const products = await getMergedProducts()
  return { success: true, products }
}

export const resetProductOverride = async (
  productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const mergedProducts = await getMergedProducts()
  const productExists = mergedProducts.some((product) => product.id === productId)
  if (!productExists) {
    return { success: false, error: 'Товар не найден' }
  }

  const overrides = await getProductOverrides()
  if (overrides[productId]) {
    delete overrides[productId]
    await writeOverridesFile(overrides)
  }

  const products = await getMergedProducts()
  return { success: true, products }
}

export const createProduct = async (
  product: Product
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const nextId = product.id.trim()
  if (!nextId) {
    return { success: false, error: 'ID товара обязателен' }
  }

  const customProducts = await getCustomProducts()
  const deletedProductIds = await getDeletedProductIds()
  const existsInBase = PRODUCTS.some((item) => item.id === nextId)
  const existsInCustom = customProducts.some((item) => item.id === nextId)

  if (existsInBase || existsInCustom) {
    return { success: false, error: 'Товар с таким ID уже существует' }
  }

  if (deletedProductIds.has(nextId)) {
    return { success: false, error: 'ID товара зарезервирован удаленным товаром' }
  }

  const normalizedProduct: Product = {
    ...product,
    id: nextId,
    title: product.title.trim(),
    brand: product.brand.trim(),
    image: product.image.trim()
  }

  customProducts.push(normalizedProduct)
  await writeCustomProductsFile(customProducts)

  const products = await getMergedProducts()
  return { success: true, products }
}

export const deleteCustomProduct = async (
  productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const nextId = productId.trim()
  if (!nextId) {
    return { success: false, error: 'ID товара обязателен' }
  }

  if (PRODUCTS.some((item) => item.id === nextId)) {
    return { success: false, error: 'Нельзя удалить базовый товар' }
  }

  const customProducts = await getCustomProducts()
  const existsInCustom = customProducts.some((item) => item.id === nextId)
  if (!existsInCustom) {
    return { success: false, error: 'Пользовательский товар не найден' }
  }

  const nextCustomProducts = customProducts.filter((item) => item.id !== nextId)
  await writeCustomProductsFile(nextCustomProducts)

  const overrides = await getProductOverrides()
  if (overrides[nextId]) {
    delete overrides[nextId]
    await writeOverridesFile(overrides)
  }

  const products = await getMergedProducts()
  return { success: true, products }
}

export const deleteProductAny = async (
  productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const nextId = productId.trim()
  if (!nextId) {
    return { success: false, error: 'ID товара обязателен' }
  }

  const mergedProducts = await getMergedProducts()
  const targetProduct = mergedProducts.find((item) => item.id === nextId)
  if (!targetProduct) {
    return { success: false, error: 'Товар не найден' }
  }

  const customProducts = await getCustomProducts()
  const existsInCustom = customProducts.some((item) => item.id === nextId)
  const existsInBase = PRODUCTS.some((item) => item.id === nextId)

  if (!existsInCustom && !existsInBase) {
    return { success: false, error: 'Товар не найден' }
  }

  if (existsInCustom) {
    const nextCustomProducts = customProducts.filter((item) => item.id !== nextId)
    await writeCustomProductsFile(nextCustomProducts)
  }

  if (existsInBase) {
    const deletedIds = await readDeletedProductIdsFile()
    if (!deletedIds.includes(nextId)) {
      deletedIds.push(nextId)
      await writeDeletedProductIdsFile(deletedIds)
    }
  }

  const overrides = await getProductOverrides()
  if (overrides[nextId]) {
    delete overrides[nextId]
    await writeOverridesFile(overrides)
  }

  const archive = await getDeletedProductsArchive()
  const nextArchive = archive.filter((entry) => entry.id !== nextId)
  nextArchive.unshift({
    id: nextId,
    product: targetProduct,
    source: existsInCustom ? 'custom' : 'base',
    deletedAt: new Date().toISOString()
  })
  await writeDeletedProductsArchiveFile(nextArchive)

  const products = await getMergedProducts()
  return { success: true, products }
}

export const restoreDeletedProduct = async (
  productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
  const nextId = productId.trim()
  if (!nextId) {
    return { success: false, error: 'ID товара обязателен' }
  }

  const archive = await getDeletedProductsArchive()
  const archived = archive.find((entry) => entry.id === nextId)
  if (!archived) {
    return { success: false, error: 'Товар не найден в архиве' }
  }

  const customProducts = await getCustomProducts()
  const deletedIds = await readDeletedProductIdsFile()
  const overrides = await getProductOverrides()

  if (archived.source === 'custom') {
    const existsInCustom = customProducts.some((item) => item.id === nextId)
    if (!existsInCustom) {
      customProducts.push(archived.product)
      await writeCustomProductsFile(customProducts)
    }
  } else {
    const nextDeletedIds = deletedIds.filter((id) => id !== nextId)
    if (nextDeletedIds.length !== deletedIds.length) {
      await writeDeletedProductIdsFile(nextDeletedIds)
    }

    const baseProduct = PRODUCTS.find((item) => item.id === nextId)
    if (baseProduct) {
      const overridePatch = buildOverrideFromSnapshot(baseProduct, archived.product)
      if (Object.keys(overridePatch).length > 0) {
        overrides[nextId] = overridePatch
      } else if (overrides[nextId]) {
        delete overrides[nextId]
      }
      await writeOverridesFile(overrides)
    }
  }

  const nextArchive = archive.filter((entry) => entry.id !== nextId)
  await writeDeletedProductsArchiveFile(nextArchive)

  const products = await getMergedProducts()
  return { success: true, products }
}

export const purgeDeletedProductArchive = async (
  productId: string
): Promise<{ success: true; archive: ArchivedProductRecord[] } | { success: false; error: string }> => {
  const nextId = productId.trim()
  if (!nextId) {
    return { success: false, error: 'ID товара обязателен' }
  }

  const archive = await getDeletedProductsArchive()
  const exists = archive.some((entry) => entry.id === nextId)
  if (!exists) {
    return { success: false, error: 'Товар не найден в архиве' }
  }

  const nextArchive = archive.filter((entry) => entry.id !== nextId)
  await writeDeletedProductsArchiveFile(nextArchive)

  return { success: true, archive: nextArchive }
}
