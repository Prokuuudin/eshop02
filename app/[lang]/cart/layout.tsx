import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const language = resolveLanguage((await params).lang);
  const t = translations[language];
  return {
    title: `${t['cart.title'] ?? 'Cart'} | Eshop`,
    description: t['meta.cartDescription'] ?? 'Shopping cart in Eshop',
    robots: { index: false, follow: false },
    alternates: { canonical: '/cart' }
  };
}

export default function CartLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
