import type { Language } from '@/data/translations'

export type LocalizedLabel = Record<Language, string>

export type CategoryConfigSubcategory = {
  slug: string
  key?: string
  labels: LocalizedLabel
  search: string
}

export type CategoryConfigItem = {
  id: string
  titleKey?: string
  href: string
  image: string
  labels: LocalizedLabel
  subcategories: CategoryConfigSubcategory[]
}

export type CategoriesConfigPayload = {
  categories: CategoryConfigItem[]
  deletedCategories: CategoryConfigItem[]
}
