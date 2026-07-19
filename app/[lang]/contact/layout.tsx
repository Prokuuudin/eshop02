import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { pageAlternates, localizePath, resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]
  const pageTitle = `${t['nav.contact'] ?? 'Contact'} | Eshop`
  const pageDescription = t['contact.info'] ?? 'Eshop support contacts: email, phone, address and working hours'

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: pageAlternates('/contact', language),
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: localizePath('/contact', language),
      type: 'website'
    }
  }
}

export default function ContactLayout({ children }: LayoutProps): ReactNode {
  return children
}
