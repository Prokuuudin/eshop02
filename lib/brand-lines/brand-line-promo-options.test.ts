import { describe, expect, it } from 'vitest'
import { localizeBrandLineOptions, type PromoBrandLineOption } from './brand-line-promo-options'

const rows: PromoBrandLineOption[] = [
  { value: 'line', label: 'ignored', parentId: null, brandName: 'STAPIZ', names: { ru: 'Линия', en: 'Line', lv: 'Līnija' } },
  { value: 'series', label: 'ignored', parentId: 'line', brandName: 'STAPIZ', names: { ru: 'Серия', en: 'Series', lv: 'Sērija' } },
]

describe('localized BrandLine options', () => {
  it.each([
    ['ru', 'ru-RU', 'STAPIZ › Линия › Серия'],
    ['en', 'en-US', 'STAPIZ › Line › Series'],
    ['lv', 'lv-LV', 'STAPIZ › Līnija › Sērija'],
  ] as const)('keeps stable ids and renders the full %s hierarchy', (language, locale, label) => {
    const result = localizeBrandLineOptions(rows, language, locale)
    expect(result.find((option) => option.value === 'series')).toEqual({ value: 'series', label })
  })
})
