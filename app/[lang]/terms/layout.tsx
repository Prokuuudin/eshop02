import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getTermsContent } from '@/data/terms-content'
import { pageAlternates, resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const content = getTermsContent(language)

  return {
    title: `${content.title} | Eshop`,
    alternates: pageAlternates('/terms', language),
  }
}

export default function TermsLayout({ children }: LayoutProps): ReactNode {
  return children
}
