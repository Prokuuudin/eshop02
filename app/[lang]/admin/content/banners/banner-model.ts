import { parseLocaleText, type LocaleText } from '@/lib/locale-text'

export type BannerType = 'sale'
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

export type BannerForm = Omit<Banner, 'id' | 'order' | 'createdAt' | 'updatedAt'>
export type ContentBlockForm = Omit<ContentBlock, 'id' | 'order' | 'createdAt' | 'updatedAt'>

export const EMPTY_BANNER: BannerForm = {
  type: 'sale', title: '', subtitle: '', image: '', link: '', ctaLabel: '',
  ctaStyle: 'primary', bgColor: '#ffffff', textColor: 'dark', active: true,
}

export const EMPTY_BLOCK: ContentBlockForm = {
  type: 'feature', title: '', subtitle: '', content: '', icon: '', link: '',
  linkLabel: '', bgColor: '#ffffff', active: true,
}

export const BANNER_TYPE_LABELS: Record<BannerType, string> = {
  sale: 'Скидка/Акция',
}

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  announcement: 'Объявление', feature: 'Преимущество', 'promo-strip': 'Промо-полоса',
  cta: 'Призыв к действию', info: 'Информационный',
}

export const CTA_STYLE_LABELS: Record<CtaStyle, string> = {
  primary: 'Основная', secondary: 'Вторичная', outline: 'Контурная',
}

export function toLocaleForm(raw: string): LocaleText {
  const parsed = parseLocaleText(raw)
  if (parsed) return parsed
  return raw ? { ru: raw } : {}
}
