import { parseLocaleText, type LocaleText } from '@/lib/locale-text'

export type BannerType = 'sale'
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

export type BannerForm = Omit<Banner, 'id' | 'order' | 'createdAt' | 'updatedAt'>

export const EMPTY_BANNER: BannerForm = {
  type: 'sale', title: '', subtitle: '', image: '', link: '', ctaLabel: '',
  ctaStyle: 'primary', bgColor: '#ffffff', textColor: 'dark', active: true,
}

export function toLocaleForm(raw: string): LocaleText {
  const parsed = parseLocaleText(raw)
  if (parsed) return parsed
  return raw ? { ru: raw } : {}
}
