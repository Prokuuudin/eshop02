import { describe, expect, it, vi } from 'vitest'
import { getLocalizedCartItemTitle } from './cart-localization'

const item = {
  id: 'db-product',
  title: 'Русское название',
  titleEn: 'English title',
  titleLv: 'Latviskais nosaukums',
}

describe('getLocalizedCartItemTitle', () => {
  it('uses the English title stored with the cart item', () => {
    expect(getLocalizedCartItemTitle(item, 'en', vi.fn())).toBe('English title')
  })

  it('uses the Latvian title stored with the cart item', () => {
    expect(getLocalizedCartItemTitle(item, 'lv', vi.fn())).toBe('Latviskais nosaukums')
  })

  it('uses the translation fallback for Russian and legacy cart items', () => {
    const t = vi.fn((_key: string, fallback?: string) => fallback ?? '')
    expect(getLocalizedCartItemTitle(item, 'ru', t)).toBe('Русское название')
    expect(t).toHaveBeenCalledWith('products.db-product.title', 'Русское название')
  })
})
