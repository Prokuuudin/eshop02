import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { translations, type Language } from '@/data/translations'

const resolveLanguageFromHeader = (acceptLanguage: string | null): Language => {
  const normalized = (acceptLanguage ?? '').toLowerCase()
  if (normalized.includes('ru')) return 'ru'
  if (normalized.includes('lv')) return 'lv'
  return 'en'
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const language = resolveLanguageFromHeader(headersList.get('accept-language'))
  const t = translations[language]
  const pageTitle = `${t['nav.contact'] ?? 'Contact'} | Eshop`
  const pageDescription = t['contact.info'] ?? 'Eshop support contacts: email, phone, address and working hours'

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: { canonical: '/contact' },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: '/contact',
      type: 'website'
    }
  }
}

export default function ContactLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
