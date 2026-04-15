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
  const language = resolveLanguageFromHeader(headersList.get('accept-language'));
  const t = translations[language];
  return {
    title: `${t['checkout.title'] ?? 'Checkout'} | Eshop`,
    description: t['meta.checkoutDescription'] ?? 'Secure checkout in Eshop',
    robots: { index: false, follow: false },
    alternates: { canonical: '/checkout' }
  };
}

export default function CheckoutLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
