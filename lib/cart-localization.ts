import type { Language } from '@/data/translations'
import type { CartItem } from '@/lib/cart-store'

type Translate = (key: string, fallback?: string) => string

export function getLocalizedCartItemTitle(
  item: Pick<CartItem, 'id' | 'titleKey' | 'title' | 'titleEn' | 'titleLv'>,
  language: Language,
  t: Translate
): string {
  if (language === 'en' && item.titleEn) return item.titleEn
  if (language === 'lv' && item.titleLv) return item.titleLv
  return t(item.titleKey ?? `products.${item.id}.title`, item.title)
}
