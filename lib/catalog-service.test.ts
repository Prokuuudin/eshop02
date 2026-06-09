import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the DB-dependent modules before importing catalog-service
vi.mock('@/lib/product-overrides-store', () => ({
  getMergedProducts: vi.fn().mockResolvedValue([])
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {}
}))

import {
  formatCatalogForDisplay,
  generateCsvCatalog,
  generateStructuredCatalog,
  searchCatalog,
  type CatalogItem
} from '@/lib/catalog-service'

const sampleItems: CatalogItem[] = [
  {
    id: 'p1',
    title: 'Крем для лица',
    brand: 'Revitaluxe',
    sku: 'RVL-001',
    image: '/img/p1.jpg',
    category: 'Кремы',
    price: 1200,
    oldPrice: 1500,
    rating: 4.5,
    stock: 10
  },
  {
    id: 'p2',
    title: 'Шампунь Volume',
    brand: 'GreenHair',
    sku: 'GH-002',
    image: '/img/p2.jpg',
    category: 'Шампуни',
    price: 800,
    rating: 4.0,
    stock: 5
  },
  {
    id: 'p3',
    title: 'Маска для волос',
    brand: 'GreenHair',
    sku: 'GH-003',
    image: '/img/p3.jpg',
    category: 'Маски',
    price: 950,
    rating: 3.8,
    stock: 0
  }
]

describe('formatCatalogForDisplay', () => {
  it('adds displayPrice to every item', () => {
    const result = formatCatalogForDisplay(sampleItems, 'ru-RU')
    result.forEach(item => {
      expect(item.displayPrice).toBeDefined()
      expect(item.displayPrice).toContain('€')
    })
  })

  it('adds displayOldPrice only for items that have oldPrice', () => {
    const result = formatCatalogForDisplay(sampleItems, 'ru-RU')
    const withOld = result.find(i => i.id === 'p1')
    const withoutOld = result.find(i => i.id === 'p2')

    expect(withOld?.displayOldPrice).toBeDefined()
    expect(withoutOld?.displayOldPrice).toBeUndefined()
  })

  it('preserves all original fields', () => {
    const result = formatCatalogForDisplay(sampleItems, 'ru-RU')
    const p1 = result.find(i => i.id === 'p1')!
    expect(p1.brand).toBe('Revitaluxe')
    expect(p1.category).toBe('Кремы')
    expect(p1.stock).toBe(10)
  })

  it('returns the same number of items as input', () => {
    const result = formatCatalogForDisplay(sampleItems, 'ru-RU')
    expect(result).toHaveLength(sampleItems.length)
  })

  it('returns empty array for empty input', () => {
    const result = formatCatalogForDisplay([], 'ru-RU')
    expect(result).toHaveLength(0)
  })
})

describe('generateCsvCatalog', () => {
  it('first row is the header row', () => {
    const csv = generateCsvCatalog(sampleItems, 'ru-RU')
    const lines = csv.split('\n')
    expect(lines[0]).toContain('ID')
    expect(lines[0]).toContain('Название')
    expect(lines[0]).toContain('Бренд')
    expect(lines[0]).toContain('Цена')
  })

  it('contains one data row per item', () => {
    const csv = generateCsvCatalog(sampleItems, 'ru-RU')
    const lines = csv.split('\n')
    // header + 3 data rows
    expect(lines).toHaveLength(sampleItems.length + 1)
  })

  it('uses — for missing sku', () => {
    const items: CatalogItem[] = [{ ...sampleItems[0], sku: undefined }]
    const csv = generateCsvCatalog(items, 'ru-RU')
    expect(csv).toContain('—')
  })

  it('includes product IDs in rows', () => {
    const csv = generateCsvCatalog(sampleItems, 'ru-RU')
    expect(csv).toContain('p1')
    expect(csv).toContain('p2')
  })

  it('uses — for items without oldPrice', () => {
    const csv = generateCsvCatalog([sampleItems[1]], 'ru-RU') // p2 has no oldPrice
    const dataLine = csv.split('\n')[1]
    expect(dataLine).toContain('—')
  })
})

describe('generateStructuredCatalog', () => {
  it('groups items by category', () => {
    const result = generateStructuredCatalog(sampleItems, 'ru-RU')
    expect(result.categories['Кремы']).toHaveLength(1)
    expect(result.categories['Шампуни']).toHaveLength(1)
    expect(result.categories['Маски']).toHaveLength(1)
  })

  it('totalItems matches the number of input items', () => {
    const result = generateStructuredCatalog(sampleItems, 'ru-RU')
    expect(result.totalItems).toBe(sampleItems.length)
  })

  it('includes version, locale and generatedAt fields', () => {
    const result = generateStructuredCatalog(sampleItems, 'ru-RU')
    expect(result.version).toBe('1.0')
    expect(result.locale).toBe('ru-RU')
    expect(result.generatedAt).toBeDefined()
  })

  it('returns empty categories when items array is empty', () => {
    const result = generateStructuredCatalog([], 'ru-RU')
    expect(result.totalItems).toBe(0)
    expect(Object.keys(result.categories)).toHaveLength(0)
  })

  it('groups multiple items in the same category together', () => {
    const result = generateStructuredCatalog(sampleItems, 'ru-RU')
    // GreenHair has items in Шампуни and Маски (separate categories), so each has 1
    const catKeys = Object.keys(result.categories)
    expect(catKeys).toHaveLength(3)
  })
})

describe('searchCatalog (in-memory items path)', () => {
  it('finds items by title substring', async () => {
    const results = await searchCatalog('крем', sampleItems)
    expect(results.some(i => i.id === 'p1')).toBe(true)
  })

  it('finds items by brand', async () => {
    const results = await searchCatalog('GreenHair', sampleItems)
    expect(results).toHaveLength(2)
    expect(results.every(i => i.brand === 'GreenHair')).toBe(true)
  })

  it('finds items by SKU', async () => {
    const results = await searchCatalog('RVL-001', sampleItems)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('p1')
  })

  it('finds items by category', async () => {
    const results = await searchCatalog('маски', sampleItems)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('p3')
  })

  it('returns empty array when no items match', async () => {
    const results = await searchCatalog('nonexistentquery', sampleItems)
    expect(results).toHaveLength(0)
  })

  it('is case-insensitive', async () => {
    const results = await searchCatalog('ШАМПУНЬ', sampleItems)
    expect(results.some(i => i.id === 'p2')).toBe(true)
  })
})
