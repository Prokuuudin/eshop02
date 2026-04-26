import type { Language } from '@/data/translations'

export type LocalizedBrandDescription = Record<Language, string>

export type BrandConfigItem = {
  id: string
  name: string
  logo: string
  popular: boolean
  description: LocalizedBrandDescription
}

export type BrandsConfigPayload = {
  brands: BrandConfigItem[]
}
