import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getPrivacyContent } from '@/data/privacy-content'
import { pageAlternates, resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const content = getPrivacyContent(language)

  return {
    title: `${content.title} | Eshop`,
    alternates: pageAlternates('/privacy', language),
  }
}

export default function PrivacyLayout({ children }: LayoutProps): ReactNode {
  return children
}
