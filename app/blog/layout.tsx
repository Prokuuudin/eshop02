import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'

export function generateMetadata(): Metadata {
  const t = translations.en
  const pageTitle = `${t['nav.blog'] ?? 'Blog'} | Eshop`
  const pageDescription = t['blog.pageTitle'] ?? 'Useful tips and trends'

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: { canonical: '/blog' },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: '/blog',
      type: 'website'
    }
  }
}

export default function BlogLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
