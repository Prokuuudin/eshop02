import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

const TITLES: Record<string, string> = {
  ru: 'Запрос спецпредложения',
  en: 'Request a quote',
  lv: 'Pieprasīt piedāvājumu',
}

const DESCRIPTIONS = {
  ru: 'Запросите индивидуальное предложение на профессиональную косметику и оборудование Hairshop-Pro.',
  en: 'Request a tailored quote for professional cosmetics and equipment from Hairshop-Pro.',
  lv: 'Pieprasiet individuālu Hairshop-Pro profesionālās kosmētikas un aprīkojuma piedāvājumu.',
} as const

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)

  return buildPublicPageMetadata({
    language,
    path: '/request-quote',
    title: TITLES[language],
    description: DESCRIPTIONS[language],
  })
}

export default function RequestQuoteLayout({ children }: LayoutProps): ReactNode {
  return children
}
