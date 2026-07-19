import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { pageAlternates, resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

const TITLES: Record<string, string> = {
  ru: 'Запрос спецпредложения',
  en: 'Request a quote',
  lv: 'Pieprasīt piedāvājumu',
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)

  return {
    title: `${TITLES[language]} | Eshop`,
    alternates: pageAlternates('/request-quote', language),
  }
}

export default function RequestQuoteLayout({ children }: LayoutProps): ReactNode {
  return children
}
