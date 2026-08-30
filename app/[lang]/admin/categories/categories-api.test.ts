import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryConfigItem } from '@/lib/categories-config'
import { loadCategoriesConfig, saveCategoriesConfig } from './categories-api'

const category = (id: string): CategoryConfigItem => ({
  id,
  href: `/catalog?cat=${id}`,
  image: '/categories/test.jpg',
  labels: { ru: id, en: id, lv: id },
  subcategories: [],
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('categories API', () => {
  it('normalizes omitted collections when loading', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)

    await expect(loadCategoriesConfig()).resolves.toEqual({ categories: [], deletedCategories: [] })
    expect(fetch).toHaveBeenCalledWith('/api/admin/categories', { cache: 'no-store' })
  })

  it('uses submitted collections when the save response omits them', async () => {
    const categories = [category('hair')]
    const deletedCategories = [category('archive')]
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)

    await expect(saveCategoriesConfig(categories, deletedCategories)).resolves.toEqual({ categories, deletedCategories })
    expect(fetch).toHaveBeenCalledWith('/api/admin/categories', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ categories, deletedCategories }),
    }))
  })

  it('rejects unsuccessful responses', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    await expect(loadCategoriesConfig()).rejects.toThrow('failed_to_load_categories')
  })
})
