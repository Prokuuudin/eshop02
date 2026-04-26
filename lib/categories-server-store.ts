import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { CATEGORY_CARDS, SUBCATEGORIES_BY_ID } from '@/data/categories'
import { translations, type Language } from '@/data/translations'
import type { CategoriesConfigPayload, CategoryConfigItem, CategoryConfigSubcategory, LocalizedLabel } from '@/lib/categories-config'

const CATEGORIES_CONFIG_FILE = path.join(process.cwd(), 'data', 'categories-config.json')
const LANGUAGES: Language[] = ['ru', 'en', 'lv']

const sanitizeId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

const sanitizeSlug = (value: string): string => sanitizeId(value)

const normalizeLabels = (input?: Partial<LocalizedLabel>, fallback = ''): LocalizedLabel => {
  const ru = input?.ru?.trim() || fallback
  const en = input?.en?.trim() || ru
  const lv = input?.lv?.trim() || ru

  return { ru, en, lv }
}

const defaultLabelsByKey = (key: string, fallback = key): LocalizedLabel => {
  const ru = translations.ru[key] ?? fallback
  const en = translations.en[key] ?? ru
  const lv = translations.lv[key] ?? ru
  return { ru, en, lv }
}

const buildDefaultPayload = (): CategoriesConfigPayload => {
  const categories: CategoryConfigItem[] = CATEGORY_CARDS.map((category) => {
    const subcategories: CategoryConfigSubcategory[] = (SUBCATEGORIES_BY_ID[category.id] ?? []).map((subcategory) => ({
      slug: subcategory.slug,
      key: subcategory.key,
      labels: defaultLabelsByKey(subcategory.key, subcategory.slug),
      search: subcategory.search
    }))

    return {
      id: category.id,
      titleKey: category.titleKey,
      href: category.href,
      image: category.image,
      labels: defaultLabelsByKey(category.titleKey, category.id),
      subcategories
    }
  })

  return { categories, deletedCategories: [] }
}

const normalizeSubcategory = (input: CategoryConfigSubcategory): CategoryConfigSubcategory | null => {
  const slug = sanitizeSlug(input.slug)
  if (!slug) return null

  return {
    slug,
    key: input.key?.trim() || undefined,
    labels: normalizeLabels(input.labels, slug),
    search: input.search?.trim() ?? ''
  }
}

const normalizeCategory = (input: CategoryConfigItem): CategoryConfigItem | null => {
  const id = sanitizeId(input.id)
  if (!id) return null

  const uniqueSubcategories = new Map<string, CategoryConfigSubcategory>()
  ;(input.subcategories ?? []).forEach((subcategory) => {
    const normalized = normalizeSubcategory(subcategory)
    if (!normalized) return
    uniqueSubcategories.set(normalized.slug, normalized)
  })

  return {
    id,
    titleKey: input.titleKey?.trim() || undefined,
    href: `/catalog?cat=${id}`,
    image: input.image?.trim() || '/categories/new.jpg',
    labels: normalizeLabels(input.labels, id),
    subcategories: Array.from(uniqueSubcategories.values())
  }
}

const normalizePayload = (input?: Partial<CategoriesConfigPayload> | null): CategoriesConfigPayload => {
  const sourceCategories = input?.categories ?? []
  const sourceDeletedCategories = input?.deletedCategories ?? []
  const uniqueCategories = new Map<string, CategoryConfigItem>()
  const uniqueDeletedCategories = new Map<string, CategoryConfigItem>()

  sourceCategories.forEach((category) => {
    const normalized = normalizeCategory(category)
    if (!normalized) return
    uniqueCategories.set(normalized.id, normalized)
  })

  sourceDeletedCategories.forEach((category) => {
    const normalized = normalizeCategory(category)
    if (!normalized) return
    uniqueDeletedCategories.set(normalized.id, normalized)
  })

  const categories = Array.from(uniqueCategories.values())
  const deletedCategories = Array.from(uniqueDeletedCategories.values()).filter((deleted) => !uniqueCategories.has(deleted.id))

  return categories.length > 0
    ? { categories, deletedCategories }
    : {
        ...buildDefaultPayload(),
        deletedCategories
      }
}

async function ensureStoreFile(): Promise<void> {
  try {
    await fs.access(CATEGORIES_CONFIG_FILE)
  } catch {
    const initial = buildDefaultPayload()
    await fs.writeFile(CATEGORIES_CONFIG_FILE, JSON.stringify(initial, null, 2), 'utf-8')
  }
}

export async function getCategoriesConfigFromStore(): Promise<CategoriesConfigPayload> {
  await ensureStoreFile()
  const content = await fs.readFile(CATEGORIES_CONFIG_FILE, 'utf-8')

  try {
    const parsed = JSON.parse(content) as Partial<CategoriesConfigPayload>
    return normalizePayload(parsed)
  } catch {
    return buildDefaultPayload()
  }
}

export async function saveCategoriesConfigToStore(payload: Partial<CategoriesConfigPayload>): Promise<CategoriesConfigPayload> {
  await ensureStoreFile()
  const normalized = normalizePayload(payload)
  await fs.writeFile(CATEGORIES_CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
}

export async function getLocalizedCategoryLabels(): Promise<Record<string, LocalizedLabel>> {
  const { categories } = await getCategoriesConfigFromStore()
  return categories.reduce<Record<string, LocalizedLabel>>((acc, category) => {
    acc[category.id] = LANGUAGES.reduce<LocalizedLabel>((labels, language) => {
      labels[language] = category.labels[language]
      return labels
    }, { ru: '', en: '', lv: '' })
    return acc
  }, {})
}
