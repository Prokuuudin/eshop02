import 'server-only'
import { prisma } from '@/lib/prisma'
import type { Banner as PrismaBanner, ContentBlock as PrismaContentBlock } from '@/generated/prisma/client'

export type BannerType = 'hero' | 'promo' | 'sale' | 'info'
export type BlockType = 'announcement' | 'feature' | 'promo-strip' | 'cta' | 'info'
export type TextColor = 'light' | 'dark'
export type CtaStyle = 'primary' | 'secondary' | 'outline'

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
  createdAt: string
  updatedAt: string
}

export type ContentBlock = {
  id: string
  type: BlockType
  title: string
  subtitle: string
  content: string
  icon: string
  link: string
  linkLabel: string
  bgColor: string
  active: boolean
  order: number
  createdAt: string
  updatedAt: string
}

export type BannersData = {
  banners: Banner[]
  blocks: ContentBlock[]
}

function mapDbToBanner(row: PrismaBanner): Banner {
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
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

function mapDbToBlock(row: PrismaContentBlock): ContentBlock {
  return {
    id: row.id,
    type: row.type as BlockType,
    title: row.title,
    subtitle: row.subtitle,
    content: row.content,
    icon: row.icon,
    link: row.link,
    linkLabel: row.linkLabel,
    bgColor: row.bgColor,
    active: row.active,
    order: row.order,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

export async function readBannersData(): Promise<BannersData> {
  const [banners, blocks] = await Promise.all([
    prisma.banner.findMany({ orderBy: { order: 'asc' } }),
    prisma.contentBlock.findMany({ orderBy: { order: 'asc' } }),
  ])
  return {
    banners: banners.map(mapDbToBanner),
    blocks: blocks.map(mapDbToBlock),
  }
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
    for (const bl of data.blocks) {
      await tx.contentBlock.upsert({
        where: { id: bl.id },
        create: {
          id: bl.id, type: bl.type, title: bl.title, subtitle: bl.subtitle,
          content: bl.content, icon: bl.icon, link: bl.link, linkLabel: bl.linkLabel,
          bgColor: bl.bgColor, active: bl.active, order: bl.order,
        },
        update: {
          type: bl.type, title: bl.title, subtitle: bl.subtitle,
          content: bl.content, icon: bl.icon, link: bl.link, linkLabel: bl.linkLabel,
          bgColor: bl.bgColor, active: bl.active, order: bl.order,
        },
      })
    }
  })
}
