import 'server-only'
import { prisma } from '@/lib/prisma'
import type { Banner as PrismaBanner } from '@/generated/prisma/client'
import { getBannerGroups, DEFAULT_GROUP_ID, type BannerGroup, type BannerZone, type BannerDisplayType } from '@/lib/banner-groups-store'
import { getBannerGroupAssignments, saveBannerGroupAssignment } from '@/lib/banner-group-assignment-store'

export type BannerType = 'sale' | 'image' | 'video'
export type TextColor = 'light' | 'dark'
export type CtaStyle = 'primary' | 'secondary' | 'outline'
export type BannerPlacement = BannerDisplayType
export type { BannerZone, BannerGroup }
export { BANNER_ZONES } from '@/lib/banner-groups-store'

export type Banner = {
  id: string
  type: BannerType
  title: string
  subtitle: string
  image: string
  link: string
  ctaLabel: string
  ctaStyle: CtaStyle
  bgColor: string
  textColor: TextColor
  active: boolean
  order: number
  groupId: string
  // Derived from the banner's group - kept as plain fields so storefront
  // components don't need to know groups exist.
  placement: BannerPlacement
  zone: BannerZone
  createdAt: string
  updatedAt: string
}

export type BannersData = {
  banners: Banner[]
}

function mapDbToBanner(row: PrismaBanner, assignments: Record<string, string>, groupsById: Map<string, BannerGroup>): Banner {
  const groupId = assignments[row.id] ?? DEFAULT_GROUP_ID
  const group = groupsById.get(groupId) ?? groupsById.get(DEFAULT_GROUP_ID)
  return {
    id: row.id,
    type: row.type as BannerType,
    title: row.title,
    subtitle: row.subtitle,
    image: row.image,
    link: row.link,
    ctaLabel: row.ctaLabel,
    ctaStyle: row.ctaStyle as CtaStyle,
    bgColor: row.bgColor,
    textColor: row.textColor as TextColor,
    active: row.active,
    order: row.order,
    groupId,
    placement: group?.displayType ?? 'list',
    zone: group?.zone ?? 'sale',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

export async function readBannersData(): Promise<BannersData> {
  const [banners, assignments, groups] = await Promise.all([
    prisma.banner.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
    getBannerGroupAssignments(),
    getBannerGroups(),
  ])
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  return { banners: banners.map((row) => mapDbToBanner(row, assignments, groupsById)) }
}

export async function writeBannersData(data: BannersData): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const b of data.banners) {
      await tx.banner.upsert({
        where: { id: b.id },
        create: {
          id: b.id, type: b.type, title: b.title, subtitle: b.subtitle,
          image: b.image, link: b.link, ctaLabel: b.ctaLabel, ctaStyle: b.ctaStyle,
          bgColor: b.bgColor, textColor: b.textColor, active: b.active, order: b.order,
        },
        update: {
          type: b.type, title: b.title, subtitle: b.subtitle,
          image: b.image, link: b.link, ctaLabel: b.ctaLabel, ctaStyle: b.ctaStyle,
          bgColor: b.bgColor, textColor: b.textColor, active: b.active, order: b.order,
        },
      })
    }
  })
  await Promise.all(data.banners.map((b) => saveBannerGroupAssignment(b.id, b.groupId ?? DEFAULT_GROUP_ID)))
}
