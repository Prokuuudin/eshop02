import type { Language } from '@/data/translations'

export type LocalizedBrandDescription = Record<Language, string>

export type BrandManufacturerInfo = {
  name?: string
  address?: string
  email?: string
}

export type BrandConfigItem = {
  id: string
  name: string
  logo: string
  isDistributor: boolean
  allowLogo: boolean
  description: LocalizedBrandDescription
  manufacturer?: BrandManufacturerInfo
  distributor?: BrandManufacturerInfo
}

export type BrandsConfigPayload = {
  brands: BrandConfigItem[]
}
