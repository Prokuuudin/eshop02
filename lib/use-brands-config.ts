'use client'

import React from 'react'
import { BRANDS } from '@/data/brands'
import { BRAND_DESCRIPTIONS } from '@/data/brandDescriptions'
import type { BrandConfigItem, BrandsConfigPayload } from '@/lib/brands-config'

const fallbackBrands: BrandConfigItem[] = BRANDS.map((brand) => {
  const fallbackDescription = BRAND_DESCRIPTIONS[brand.id] ?? {
    ru: typeof brand.description === 'string' ? brand.description : '',
    en: typeof brand.description === 'string' ? brand.description : '',
    lv: typeof brand.description === 'string' ? brand.description : ''
  }

  return {
    id: brand.id,
    name: brand.name,
    logo: brand.logo,
    popular: Boolean(brand.popular),
    description: {
      ru: typeof brand.description === 'object' ? brand.description.ru : fallbackDescription.ru,
      en: typeof brand.description === 'object' ? brand.description.en : fallbackDescription.en,
      lv: typeof brand.description === 'object' ? brand.description.lv : fallbackDescription.lv
    }
  }
})

export function useBrandsConfig() {
  const [brands, setBrands] = React.useState<BrandConfigItem[]>(fallbackBrands)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/brands', { cache: 'no-store' })
      if (!response.ok) throw new Error('failed_to_load_brands')

      const payload = (await response.json()) as Partial<BrandsConfigPayload>
      if (payload.brands?.length) {
        setBrands(payload.brands)
      } else {
        setBrands(fallbackBrands)
      }
      setError(null)
    } catch {
      setBrands(fallbackBrands)
      setError('failed_to_load_brands')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return { brands, loading, error, reload: load }
}
