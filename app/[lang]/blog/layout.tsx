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
  const pageTitle = `${t['nav.blog'] ?? 'Blog'} | Eshop`
  const pageDescription = t['blog.pageTitle'] ?? 'Useful tips and trends'

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: pageAlternates('/blog', language),
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: localizePath('/blog', language),
      type: 'website'
    }
  }
}

export default function BlogLayout({ children }: LayoutProps): ReactNode {
  return children
}
