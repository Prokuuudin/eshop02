import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'

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

const BANNERS_FILE = path.join(process.cwd(), 'data', 'banners.json')

const EMPTY_DATA: BannersData = { banners: [], blocks: [] }

async function ensureFile(): Promise<void> {
  try {
    await fs.access(BANNERS_FILE)
  } catch {
    await fs.writeFile(BANNERS_FILE, JSON.stringify(EMPTY_DATA, null, 2), 'utf-8')
  }
}

export async function readBannersData(): Promise<BannersData> {
  await ensureFile()
  const raw = await fs.readFile(BANNERS_FILE, 'utf-8')
  try {
    const parsed = JSON.parse(raw) as Partial<BannersData>
    return {
      banners: Array.isArray(parsed.banners) ? parsed.banners : [],
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : []
    }
  } catch {
    return { ...EMPTY_DATA }
  }
}

export async function writeBannersData(data: BannersData): Promise<void> {
  await ensureFile()
  await fs.writeFile(BANNERS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}
