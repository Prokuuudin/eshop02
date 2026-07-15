import { describe, it, expect } from 'vitest'
import type { Product } from '@/data/products'
import { buildProductIndex, pickRelated, pickBoughtTogether } from './related-products'

const makeProduct = (overrides: Partial<Product> & { id: string }): Product => ({
  title: `Product ${overrides.id}`,
  brand: 'BrandA',
  price: 10,
  rating: 4,
  category: 'hair',
  stock: 5,
  ...overrides,
} as Product)

const pool = [
  makeProduct({ id: '1', brand: 'BrandA', category: 'hair' }),
  makeProduct({ id: '2', brand: 'BrandA', category: 'hair' }),
  makeProduct({ id: '3', brand: 'BrandA', category: 'nails' }),
  makeProduct({ id: '4', brand: 'BrandB', category: 'hair' }),
  makeProduct({ id: '5', brand: 'BrandB', category: 'face' }),
  makeProduct({ id: '6', brand: 'BrandC', category: 'hair' }),
]
const byId = buildProductIndex(pool)

describe('pickRelated', () => {
  it('использует явный список, сохраняет порядок, исключает себя и дубликаты', () => {
    const p = makeProduct({ id: '1', relatedProductIds: ['4', '1', '4', '3'] })
    expect(pickRelated(p, pool, byId).map((x) => x.id)).toEqual(['4', '3'])
  })

  it('игнорирует ссылки на отсутствующие в пуле товары', () => {
    const p = makeProduct({ id: '1', relatedProductIds: ['999', '5'] })
    expect(pickRelated(p, pool, byId).map((x) => x.id)).toEqual(['5'])
  })

  it('пустой явный список → фолбэк: бренд+категория, бренд, категория', () => {
    const p = makeProduct({ id: '1', relatedProductIds: [] })
    expect(pickRelated(p, pool, byId).map((x) => x.id)).toEqual(['2', '3', '4', '6'])
  })

  it('явный список, целиком ведущий на отсутствующие товары → фолбэк', () => {
    const p = makeProduct({ id: '1', relatedProductIds: ['999'] })
    expect(pickRelated(p, pool, byId).map((x) => x.id)).toEqual(['2', '3', '4', '6'])
  })

  it('ограничивает результат max', () => {
    const p = makeProduct({ id: '1' })
    expect(pickRelated(p, pool, byId, 2)).toHaveLength(2)
  })
})

describe('pickBoughtTogether', () => {
  it('использует явный список', () => {
    const p = makeProduct({ id: '1', oftenBoughtTogether: ['3', '5'] })
    expect(pickBoughtTogether(p, byId, {}).map((x) => x.id)).toEqual(['3', '5'])
  })

  it('явный список исключает сам товар (данные nopCommerce содержат self-ссылки)', () => {
    const p = makeProduct({ id: '1', oftenBoughtTogether: ['1', '2'] })
    expect(pickBoughtTogether(p, byId, {}).map((x) => x.id)).toEqual(['2'])
  })

  it('пустой явный список → co-purchase фолбэк', () => {
    const p = makeProduct({ id: '1', oftenBoughtTogether: [] })
    const copurchase = { '1': ['6', '999', '4'] }
    expect(pickBoughtTogether(p, byId, copurchase).map((x) => x.id)).toEqual(['6', '4'])
  })

  it('нет ни явного списка, ни co-purchase → пусто (блок скрыт)', () => {
    const p = makeProduct({ id: '1' })
    expect(pickBoughtTogether(p, byId, {})).toEqual([])
  })
})
