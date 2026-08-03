import 'server-only'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { BRANDS } from '@/data/brands'
import { BRAND_DESCRIPTIONS } from '@/data/brandDescriptions'
import type { BrandsConfigPayload, BrandConfigItem, LocalizedBrandDescription, BrandManufacturerInfo } from '@/lib/brands-config'
import type { ExtendedTransactionClient } from '@/lib/prisma'

const BRANDS_CONFIG_KEY = 'brands-config'

const sanitizeSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

const normalizeDescription = (input?: Partial<LocalizedBrandDescription>, fallback = ''): LocalizedBrandDescription => {
  const ru = input?.ru?.trim() || fallback
  const en = input?.en?.trim() || ru
  const lv = input?.lv?.trim() || ru
  return { ru, en, lv }
}

const resolveDescriptionFromStatic = (brandId: string, brandDescription?: string | { ru: string; en: string; lv: string }): LocalizedBrandDescription => {
  if (brandDescription && typeof brandDescription === 'object') {
    return normalizeDescription(brandDescription, '')
  }

  const dict = BRAND_DESCRIPTIONS[brandId]
  if (dict) {
    return normalizeDescription(dict, '')
  }

  const fallback = typeof brandDescription === 'string' ? brandDescription : ''
  return normalizeDescription({ ru: fallback, en: fallback, lv: fallback }, fallback)
}

const normalizeBrandManufacturerInfo = (
  input?: Partial<BrandManufacturerInfo> | null
): BrandManufacturerInfo | undefined => {
  if (!input) return undefined
  const name = input.name?.trim() || undefined
  const address = input.address?.trim() || undefined
  const email = input.email?.trim() || undefined
  if (!name && !address && !email) return undefined
  return { name, address, email }
}

const buildDefaultPayload = (): BrandsConfigPayload => {
  const brands: BrandConfigItem[] = BRANDS.map((brand) => {
    const extendedBrand = brand as typeof brand & {
      manufacturer?: BrandManufacturerInfo
      distributor?: BrandManufacturerInfo
    }
    return {
      id: sanitizeSlug(brand.id),
      name: brand.name,
      logo: brand.logo,
      popular: Boolean(brand.popular),
      isDistributor: Boolean(brand.isDistributor),
      allowLogo: brand.allowLogo !== false,
      description: resolveDescriptionFromStatic(brand.id, brand.description),
      manufacturer: normalizeBrandManufacturerInfo(extendedBrand.manufacturer),
      distributor: normalizeBrandManufacturerInfo(extendedBrand.distributor),
    }
  })

  return { brands }
}

const normalizeBrand = (brand: BrandConfigItem): BrandConfigItem | null => {
  const id = sanitizeSlug(brand.id)
  const name = brand.name?.trim()
  const logo = brand.logo?.trim()
  if (!id || !name || !logo) return null

  return {
    id,
    name,
    logo,
    popular: Boolean(brand.popular),
    isDistributor: Boolean(brand.isDistributor),
    allowLogo: brand.allowLogo !== false,
    description: normalizeDescription(brand.description),
    manufacturer: normalizeBrandManufacturerInfo(brand.manufacturer),
    distributor: normalizeBrandManufacturerInfo(brand.distributor),
  }
}

const normalizePayload = (input?: Partial<BrandsConfigPayload> | null): BrandsConfigPayload => {
  const unique = new Map<string, BrandConfigItem>()

  ;(input?.brands ?? []).forEach((brand) => {
    const normalized = normalizeBrand(brand)
    if (!normalized) return
    unique.set(normalized.id, normalized)
  })

  const brands = Array.from(unique.values())
  return brands.length > 0 ? { brands } : buildDefaultPayload()
}

export async function getBrandsConfigFromStore(db: Pick<ExtendedTransactionClient, 'keyValueSetting'> = prisma): Promise<BrandsConfigPayload> {
  const row = await db.keyValueSetting.findUnique({ where: { key: BRANDS_CONFIG_KEY } })
  if (!row) return buildDefaultPayload()
  try {
    return normalizePayload(row.value as Partial<BrandsConfigPayload>)
  } catch {
    return buildDefaultPayload()
  }
}

export async function saveBrandsConfigToStore(payload: Partial<BrandsConfigPayload>, db: Pick<ExtendedTransactionClient, 'keyValueSetting'> = prisma): Promise<BrandsConfigPayload> {
  const normalized = normalizePayload(payload)
  await db.keyValueSetting.upsert({
    where: { key: BRANDS_CONFIG_KEY },
    create: { key: BRANDS_CONFIG_KEY, value: normalized as unknown as Prisma.InputJsonValue },
    update: { value: normalized as unknown as Prisma.InputJsonValue },
  })
  return normalized
}
