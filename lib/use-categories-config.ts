'use client'

import React from 'react'
import { CATEGORY_CARDS, SUBCATEGORIES_BY_ID } from '@/data/categories'
import type { CategoriesConfigPayload, CategoryConfigItem } from '@/lib/categories-config'

const fallbackCategories: CategoryConfigItem[] = CATEGORY_CARDS.map((category) => ({
  id: category.id,
  titleKey: category.titleKey,
  href: category.href,
  image: category.image,
  labels: { ru: category.id, en: category.id, lv: category.id },
  subcategories: (SUBCATEGORIES_BY_ID[category.id] ?? []).map((subcategory) => ({
    slug: subcategory.slug,
    key: subcategory.key,
    labels: { ru: subcategory.slug, en: subcategory.slug, lv: subcategory.slug },
    search: subcategory.search
  }))
}))

export function useCategoriesConfig() {
  const [categories, setCategories] = React.useState<CategoryConfigItem[]>(fallbackCategories)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/categories', { cache: 'no-store' })
      if (!response.ok) throw new Error('failed_to_load_categories')

      const payload = (await response.json()) as Partial<CategoriesConfigPayload>
      if (payload.categories?.length) {
        setCategories(payload.categories)
      } else {
        setCategories(fallbackCategories)
      }
      setError(null)
    } catch {
      setCategories(fallbackCategories)
      setError('failed_to_load_categories')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return { categories, loading, error, reload: load }
}
