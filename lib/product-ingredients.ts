import type { Product } from '@/data/products'

// Состав хранится в technicalSpecs под ключом-лейблом из исходного описания
// nopCommerce ("Sastāvs", "INGREDIENTS", "Состав", ...) — см. scripts/parse-descriptions.ts.
// INCI-наименования одинаковы для всех языков, поэтому строка одна на товар.
export const INGREDIENT_KEY_RE = /ingredient|sast[āa]v|состав/i

export const isIngredientKey = (key: string): boolean => INGREDIENT_KEY_RE.test(key)

export function getProductIngredients(product: Product): string {
  return Object.entries(product.technicalSpecs ?? {})
    .filter(([key, value]) => !key.startsWith('__') && isIngredientKey(key) && value.trim())
    .map(([, value]) => value.trim())
    .join('\n\n')
}
