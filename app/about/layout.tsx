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

const getAboutMeta = (language: Language): { title: string; description: string } => {
  const t = translations[language]
  const pageTitle = t['about.title'] ?? 'About us'
  const pageDescription = t['about.welcome.p1'] ?? 'About Eshop, our mission, service and contacts'

  return {
    title: `${pageTitle} | Eshop`,
    description: pageDescription
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = headers();
  const language = resolveLanguageFromHeader((await headers()).get('accept-language'));
  const aboutMeta = getAboutMeta(language);

  return {
    title: aboutMeta.title,
    description: aboutMeta.description,
    alternates: { canonical: '/about' },
    openGraph: {
      title: aboutMeta.title,
      description: aboutMeta.description,
      url: '/about',
      type: 'website'
    }
  };
}

export default function AboutLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
