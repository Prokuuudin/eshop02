import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]
  const pageTitle = t['nav.blog'] ?? 'Blog'
  const pageDescription = t['blog.pageTitle'] ?? 'Useful tips and trends'

  return buildPublicPageMetadata({ language, path: '/blog', title: pageTitle, description: pageDescription })
}

export default function BlogLayout({ children }: LayoutProps): ReactNode {
  return children
}
