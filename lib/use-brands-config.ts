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
    isDistributor: Boolean(brand.isDistributor),
    allowLogo: brand.allowLogo !== false,
    description: {
      ru: typeof brand.description === 'object' ? brand.description.ru : fallbackDescription.ru,
      en: typeof brand.description === 'object' ? brand.description.en : fallbackDescription.en,
      lv: typeof brand.description === 'object' ? brand.description.lv : fallbackDescription.lv
    }
  }
})

type BrandsConfigResult = {
  brands: BrandConfigItem[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useBrandsConfig(initialBrands?: BrandConfigItem[]): BrandsConfigResult {
  const hasInitialBrands = Boolean(initialBrands)
  const [brands, setBrands] = React.useState<BrandConfigItem[]>(initialBrands ?? fallbackBrands)
  const [loading, setLoading] = React.useState(!hasInitialBrands)
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
    if (hasInitialBrands) return
    queueMicrotask(() => void load())
  }, [hasInitialBrands, load])

  return { brands, loading, error, reload: load }
}
