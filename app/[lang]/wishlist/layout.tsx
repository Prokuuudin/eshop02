import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]

  return {
    title: `${t['wishlist.title'] ?? 'Wishlist'} | Eshop`,
    robots: { index: false, follow: false },
    alternates: { canonical: '/wishlist' },
  }
}

export default function WishlistLayout({ children }: LayoutProps): ReactNode {
  return children
}
