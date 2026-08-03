import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]

  const descriptions = {
    ru: 'Адреса, телефоны и часы работы магазинов Hairshop-Pro в Латвии.',
    en: 'Addresses, phone numbers and opening hours of Hairshop-Pro stores in Latvia.',
    lv: 'Hairshop-Pro veikalu adreses, tālruņi un darba laiks Latvijā.',
  }
  return buildPublicPageMetadata({
    language,
    path: '/stores',
    title: t['stores.title'] ?? 'Stores',
    description: descriptions[language],
  })
}

export default function StoresLayout({ children }: LayoutProps): ReactNode {
  return children
}
