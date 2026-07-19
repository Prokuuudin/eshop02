import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getCookieContent } from '@/data/cookie-content'
import { pageAlternates, resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const content = getCookieContent(language)

  return {
    title: `${content.title} | Eshop`,
    alternates: pageAlternates('/cookies', language),
  }
}

export default function CookiesLayout({ children }: LayoutProps): ReactNode {
  return children
}
