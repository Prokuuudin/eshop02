import 'server-only'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

// Named after the homepage section each zone's block renders next to.
export const BANNER_ZONES = [
  'top', 'hero', 'benefits', 'sale', 'bestsellers', 'categories', 'brands',
  'productRequest', 'retail', 'bonus', 'faq',
] as const

export type BannerZone = typeof BANNER_ZONES[number]
export type BannerDisplayType = 'list' | 'carousel'

export type BannerGroup = {
  id: string
  name: string
  zone: BannerZone
  displayType: BannerDisplayType
  order: number
}

export const DEFAULT_GROUP_ID = 'default'

const DEFAULT_GROUP: BannerGroup = {
  id: DEFAULT_GROUP_ID,
  name: 'Акции',
  zone: 'sale',
  displayType: 'list',
  order: 0,
}

const BANNER_GROUPS_KEY = 'banner-groups'

function isBannerZone(value: unknown): value is BannerZone {
  return typeof value === 'string' && (BANNER_ZONES as readonly string[]).includes(value)
}

function normalizeGroup(input: Partial<BannerGroup>, order: number): BannerGroup | null {
  if (typeof input.id !== 'string' || !input.id.trim()) return null
  return {
    id: input.id,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : input.id,
    zone: isBannerZone(input.zone) ? input.zone : 'sale',
    displayType: input.displayType === 'carousel' ? 'carousel' : 'list',
    order: typeof input.order === 'number' ? input.order : order,
  }
}

export async function getBannerGroups(): Promise<BannerGroup[]> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: BANNER_GROUPS_KEY } })
  const stored = (row?.value as { groups?: Partial<BannerGroup>[] } | null)?.groups
  const groups = (stored ?? [])
    .map((item, index) => normalizeGroup(item, index))
    .filter((item): item is BannerGroup => item !== null)
  if (!groups.some((group) => group.id === DEFAULT_GROUP_ID)) {
    groups.unshift(DEFAULT_GROUP)
  }
  return groups.sort((a, b) => a.order - b.order)
}

export async function saveBannerGroups(groups: BannerGroup[]): Promise<BannerGroup[]> {
  const normalized = groups
    .map((item, index) => normalizeGroup(item, index))
    .filter((item): item is BannerGroup => item !== null)
  if (!normalized.some((group) => group.id === DEFAULT_GROUP_ID)) {
    normalized.unshift(DEFAULT_GROUP)
  }
  await prisma.keyValueSetting.upsert({
    where: { key: BANNER_GROUPS_KEY },
    create: { key: BANNER_GROUPS_KEY, value: { groups: normalized } as unknown as Prisma.InputJsonValue },
    update: { value: { groups: normalized } as unknown as Prisma.InputJsonValue },
  })
  return normalized
}
