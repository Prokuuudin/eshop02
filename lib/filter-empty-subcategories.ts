import type { CategoryConfigItem } from './categories-config'

type ProductSubcatSlice = { category: string; subcategory?: string }

/**
 * Убирает из конфига витрины сабкатегории без единого активного товара
 * (например salon-products / gift-ideas — в MSSQL-выгрузке нет тегов-источников).
 * Категории не трогает: пустая категория остаётся карточкой без дропдауна.
 * Админский /api/admin/categories этим не фильтруется — там нужен полный список.
 */
export function filterEmptySubcategories(
  categories: CategoryConfigItem[],
  products: ProductSubcatSlice[]
): CategoryConfigItem[] {
  const populated = new Set<string>()
  for (const product of products) {
    if (product.subcategory) populated.add(`${product.category}:${product.subcategory}`)
  }
  return categories.map((category) => ({
    ...category,
    subcategories: category.subcategories.filter((subcategory) =>
      populated.has(`${category.id}:${subcategory.slug}`)
    )
  }))
}
