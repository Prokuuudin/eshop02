import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import { BRANDS } from '@/data/brands'
import { BRAND_DESCRIPTIONS } from '@/data/brandDescriptions'
import type { BrandsConfigPayload, BrandConfigItem, LocalizedBrandDescription } from '@/lib/brands-config'

const BRANDS_CONFIG_FILE = path.join(process.cwd(), 'data', 'brands-config.json')

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

const buildDefaultPayload = (): BrandsConfigPayload => {
  const brands: BrandConfigItem[] = BRANDS.map((brand) => ({
    id: sanitizeSlug(brand.id),
    name: brand.name,
    logo: brand.logo,
    popular: Boolean(brand.popular),
    description: resolveDescriptionFromStatic(brand.id, brand.description)
  }))

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
    description: normalizeDescription(brand.description)
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

async function ensureStoreFile(): Promise<void> {
  try {
    await fs.access(BRANDS_CONFIG_FILE)
  } catch {
    const initial = buildDefaultPayload()
    await fs.writeFile(BRANDS_CONFIG_FILE, JSON.stringify(initial, null, 2), 'utf-8')
  }
}

export async function getBrandsConfigFromStore(): Promise<BrandsConfigPayload> {
  await ensureStoreFile()
  const content = await fs.readFile(BRANDS_CONFIG_FILE, 'utf-8')

  try {
    const parsed = JSON.parse(content) as Partial<BrandsConfigPayload>
    return normalizePayload(parsed)
  } catch {
    return buildDefaultPayload()
  }
}

export async function saveBrandsConfigToStore(payload: Partial<BrandsConfigPayload>): Promise<BrandsConfigPayload> {
  await ensureStoreFile()
  const normalized = normalizePayload(payload)
  await fs.writeFile(BRANDS_CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
}
