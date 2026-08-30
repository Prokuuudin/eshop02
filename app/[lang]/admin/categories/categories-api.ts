import type { CategoriesConfigPayload, CategoryConfigItem } from '@/lib/categories-config'

export async function loadCategoriesConfig(): Promise<CategoriesConfigPayload> {
  const response = await fetch('/api/admin/categories', { cache: 'no-store' })
  if (!response.ok) throw new Error('failed_to_load_categories')

  const payload = (await response.json()) as Partial<CategoriesConfigPayload>
  return {
    categories: payload.categories ?? [],
    deletedCategories: payload.deletedCategories ?? [],
  }
}

export async function saveCategoriesConfig(
  categories: CategoryConfigItem[],
  deletedCategories: CategoryConfigItem[]
): Promise<CategoriesConfigPayload> {
  const response = await fetch('/api/admin/categories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories, deletedCategories }),
  })
  if (!response.ok) throw new Error('failed_to_save_categories')

  const payload = (await response.json()) as Partial<CategoriesConfigPayload>
  return {
    categories: payload.categories ?? categories,
    deletedCategories: payload.deletedCategories ?? deletedCategories,
  }
}
