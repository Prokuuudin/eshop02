import { parseLocaleText, type LocaleText } from '@/lib/locale-text'

export type BannerType = 'sale' | 'image' | 'video'
export type TextColor = 'light' | 'dark'
export type CtaStyle = 'primary' | 'secondary' | 'outline'
export type BannerPlacement = 'list' | 'carousel'

// Named after the homepage section each zone's block renders next to.
export const BANNER_ZONES = [
  'top', 'hero', 'benefits', 'sale', 'bestsellers', 'categories', 'brands',
  'productRequest', 'retail', 'bonus', 'faq',
] as const
export type BannerZone = typeof BANNER_ZONES[number]

export const BANNER_ZONE_LABELS: Record<BannerZone, [string, string, string]> = {
  top: ['Перед главным экраном', 'Above the hero', 'Pirms galvenā ekrāna'],
  hero: ['Под главным экраном', 'Below the hero', 'Zem galvenā ekrāna'],
  benefits: ['После преимуществ', 'After the benefits row', 'Aiz priekšrocībām'],
  sale: ['В блоке акций', 'In the sale block', 'Akciju blokā'],
  bestsellers: ['После бестселлеров', 'After bestsellers', 'Aiz bestselleriem'],
  categories: ['После категорий', 'After categories', 'Aiz kategorijām'],
  brands: ['После брендов', 'After brands', 'Aiz zīmoliem'],
  productRequest: ['После формы запроса товара', 'After the product request form', 'Aiz preces pieprasījuma formas'],
  retail: ['После розничного блока', 'After the retail block', 'Aiz mazumtirdzniecības bloka'],
  bonus: ['После бонусной программы', 'After the bonus program', 'Aiz bonusu programmas'],
  faq: ['В конце страницы (после FAQ)', 'At the bottom of the page (after FAQ)', 'Lapas beigās (aiz BUJ)'],
}

export const DEFAULT_GROUP_ID = 'default'

export type BannerGroup = {
  id: string
  name: string
  zone: BannerZone
  displayType: BannerPlacement
  order: number
}

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
  // Derived from the banner's group - display only, not submitted from the form.
  placement: BannerPlacement
  zone: BannerZone
  createdAt: string
  updatedAt: string
}

export type BannerForm = Omit<Banner, 'id' | 'order' | 'createdAt' | 'updatedAt' | 'placement' | 'zone'>

export const EMPTY_BANNER: BannerForm = {
  type: 'sale', title: '', subtitle: '', image: '', link: '', ctaLabel: '',
  ctaStyle: 'primary', bgColor: '#ffffff', textColor: 'dark', active: true, groupId: DEFAULT_GROUP_ID,
}

export function toLocaleForm(raw: string): LocaleText {
  const parsed = parseLocaleText(raw)
  if (parsed) return parsed
  return raw ? { ru: raw } : {}
}
