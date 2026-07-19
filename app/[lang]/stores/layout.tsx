import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { pageAlternates, resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]

  return {
    title: `${t['stores.title'] ?? 'Stores'} | Eshop`,
    alternates: pageAlternates('/stores', language),
  }
}

export default function StoresLayout({ children }: LayoutProps): ReactNode {
  return children
}
