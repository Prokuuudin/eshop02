// Пример утилит для работы с продуктами
import type { Product } from '@/data/products';

export function getLocalizedProductTitle(product: Product, lang: string = 'ru') {
  if (lang === 'en') return product.titleEn || product.title;
  if (lang === 'lv') return product.titleLv || product.title;
  return product.title;
}
