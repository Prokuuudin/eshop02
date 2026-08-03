import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getCookieContent } from '@/data/cookie-content'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const content = getCookieContent(language)

  const descriptions = {
    ru: 'Информация об использовании файлов cookie на сайте Hairshop-Pro и управлении согласием.',
    en: 'Information about cookies used by Hairshop-Pro and how to manage your consent.',
    lv: 'Informācija par Hairshop-Pro izmantotajām sīkdatnēm un piekrišanas pārvaldību.',
  }
  return buildPublicPageMetadata({ language, path: '/cookies', title: content.title, description: descriptions[language] })
}

export default function CookiesLayout({ children }: LayoutProps): ReactNode {
  return children
}
